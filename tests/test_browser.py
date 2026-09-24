"""Real browser checks against a supervised test web process and synthetic PostgreSQL."""

import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx
import pytest
from conftest import TEST_PASSWORD
from playwright.sync_api import sync_playwright

pytestmark = [pytest.mark.postgres, pytest.mark.browser]


@pytest.fixture
def browser_server(database, employees, tmp_path):
    with socket.socket() as socket_handle:
        socket_handle.bind(("127.0.0.1", 0))
        port = socket_handle.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"
    environment = {**os.environ, "APP_ENV": "test", "APP_URL": origin, "MAIL_ENABLED": "false"}
    with (tmp_path / "web.log").open("wb") as log:
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
                "--no-access-log",
                "--no-proxy-headers",
            ],
            env=environment,
            stdout=log,
            stderr=log,
            cwd=Path(__file__).resolve().parent.parent,
        )
        try:
            with httpx.Client(trust_env=False, timeout=1) as client:
                for _ in range(100):
                    if process.poll() is not None:
                        raise AssertionError(
                            "Supervised browser test server exited before readiness"
                        )
                    try:
                        if client.get(origin + "/ready").status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    time.sleep(0.1)
                else:
                    raise AssertionError("Supervised browser test server was not ready")
            yield origin
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def login(page, origin, username):
    page.goto(origin, wait_until="networkidle")
    page.locator('form[data-action="login-form"] input[name="username"]').fill(username)
    page.locator('form[data-action="login-form"] input[name="password"]').fill(TEST_PASSWORD)
    page.locator('form[data-action="login-form"] button[type="submit"]').click()
    page.locator('form[data-action="login-form"]').wait_for(state="hidden")


@pytest.mark.parametrize(
    "viewport", [{"width": 1365, "height": 900}, {"width": 390, "height": 844}]
)
def test_calendar_login_submission_and_administration_in_browser(browser_server, viewport):
    binary = shutil.which("chromium")
    if not binary:
        pytest.skip("Install the isolated development chromium package for browser checks")
    errors, external = [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=binary,
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking"],
        )
        context = browser.new_context(viewport=viewport, timezone_id="Europe/Madrid")

        def allow_test_origin(route):
            if urlparse(route.request.url).netloc == urlparse(browser_server).netloc:
                route.continue_()
            else:
                external.append(route.request.url)
                route.abort()

        context.route("**/*", allow_test_origin)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            login(page, browser_server, "worker")
            form = page.locator('form[data-action="request-form"]')
            form.wait_for(timeout=10000)
            form.locator('[name="dateFrom"]').fill("2026-10-19")
            form.locator('[name="dateTo"]').fill("2026-10-20")
            form.locator('[name="note"]').fill("Solicitud sintética desde navegador")
            with page.expect_response(
                lambda r: r.url.endswith("/api/requests") and r.request.method == "POST"
            ) as response:
                form.locator('button[type="submit"]').click()
            assert response.value.status == 200, response.value.text()
            page.get_by_text("Solicitud enviada correctamente", exact=False).first.wait_for()
            identifier = response.value.json()["id"]
            # A separate session verifies independent approval state.
            manager_context = browser.new_context(timezone_id="Europe/Madrid")
            manager_context.route("**/*", allow_test_origin)
            manager_page = manager_context.new_page()
            manager_page.on("pageerror", lambda error: errors.append(str(error)))
            login(manager_page, browser_server, "manager")
            manager_page.locator('[data-action="nav"][data-route="aprobaciones"]').first.click()
            manager_page.locator(f'[data-action="approve-request"][data-id="{identifier}"]').click()
            manager_page.get_by_text("Solicitud aprobada", exact=False).first.wait_for()
            manager_context.close()
            admin_context = browser.new_context(timezone_id="Europe/Madrid")
            admin_context.route("**/*", allow_test_origin)
            admin_page = admin_context.new_page()
            admin_page.on("pageerror", lambda error: errors.append(str(error)))
            login(admin_page, browser_server, "admin")
            admin_page.goto(browser_server + "/admin", wait_until="networkidle")
            admin_page.get_by_text("Configuración cargada.", exact=True).wait_for()
            admin_page.locator("#default-allowance").fill("23")
            admin_page.locator("#configuration-form button").click()
            admin_page.locator("#configuration-form .result").get_by_text(
                "Las concesiones anuales", exact=False
            ).wait_for()
            admin_context.close()
            assert errors == [], errors
            assert external == [], external
        finally:
            context.close()
            browser.close()


@pytest.mark.parametrize(
    "viewport", [{"width": 1365, "height": 900}, {"width": 390, "height": 844}]
)
def test_eight_character_password_forms_in_browser(browser_server, viewport):
    binary = shutil.which("chromium")
    if not binary:
        pytest.skip("Install the isolated development chromium package for browser checks")
    errors, external = [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=binary,
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking"],
        )
        context = browser.new_context(viewport=viewport, timezone_id="Europe/Madrid")
        context.set_default_timeout(10000)

        def allow_test_origin(route):
            if urlparse(route.request.url).netloc == urlparse(browser_server).netloc:
                route.continue_()
            else:
                external.append(route.request.url)
                route.abort()

        context.route("**/*", allow_test_origin)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))

        def check_password_field(field):
            assert field.get_attribute("minlength") == "8"
            field.fill("x" * 7)
            assert not field.evaluate("element => element.checkValidity()")
            field.fill("x" * 8)
            assert field.evaluate("element => element.checkValidity()")

        def open_sidebar_if_needed(selector):
            page.locator(".app-shell").wait_for()
            if not page.locator(selector + ":visible").count():
                page.locator('[data-action="toggle-mobile-menu"]:visible').first.click()

        try:
            login(page, browser_server, "admin")
            navigation = '[data-action="nav"][data-route="administracion"]'
            open_sidebar_if_needed(navigation)
            page.locator(navigation + ":visible").first.click()
            page.locator('[data-action="open-add-worker-modal"]').click()
            form = page.locator('form[data-action="add-worker-form"]')
            form.locator('[name="name"]').fill("Synthetic browser password policy")
            form.locator('[name="email"]').fill("browser-policy@example.com")
            form.locator('[name="username"]').fill("browser-policy")
            check_password_field(form.locator('[name="password"]'))
            with page.expect_response(
                lambda r: r.url.endswith("/api/users") and r.request.method == "POST"
            ) as response:
                form.locator('button[type="submit"]').click()
            assert response.value.status == 200, response.value.text()
            form.wait_for(state="hidden")

            page.locator('[data-action="open-reset-password-modal"][data-id="test-worker"]').click()
            form = page.locator('form[data-action="reset-password-form"]')
            check_password_field(form.locator('[name="newPassword"]'))
            with page.expect_response(
                lambda r: (
                    r.url.endswith("/api/users/test-worker/reset-password")
                    and r.request.method == "POST"
                )
            ) as response:
                form.locator('button[type="submit"]').click()
            assert response.value.status == 200, response.value.text()
            form.wait_for(state="hidden")

            menu = '[data-action="toggle-user-menu"]'
            open_sidebar_if_needed(menu)
            page.locator(menu + ":visible").first.click()
            page.locator('[data-action="open-change-password"]:visible').first.click()
            form = page.locator('form[data-action="change-password-form"]')
            form.locator('[name="currentPassword"]').fill(TEST_PASSWORD)
            check_password_field(form.locator('[name="newPassword"]'))
            with page.expect_response(
                lambda r: r.url.endswith("/api/auth/change-password") and r.request.method == "POST"
            ) as response:
                form.locator('button[type="submit"]').click()
            assert response.value.status == 200, response.value.text()
            form = page.locator('form[data-action="login-form"]')
            form.wait_for()
            form.locator('[name="username"]').fill("admin")
            form.locator('[name="password"]').fill("x" * 8)
            with page.expect_response(
                lambda r: r.url.endswith("/api/auth/login") and r.request.method == "POST"
            ) as response:
                form.locator('button[type="submit"]').click()
            assert response.value.status == 200, response.value.text()
            form.wait_for(state="hidden")
            assert errors == [], errors
            assert external == [], external
        finally:
            context.close()
            browser.close()


@pytest.mark.parametrize("width", [1365, 390])
@pytest.mark.parametrize("terminal_status", ["sent", "failed"])
def test_invitation_status_refreshes_in_browser(browser_server, width, terminal_status):
    """Real UI with controlled SMTP-status responses; backend delivery is tested separately."""
    import json

    binary = shutil.which("chromium")
    if not binary:
        pytest.skip("Install Chromium for browser verification")
    delivery_ready, submissions, status_reads = False, [], []
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=binary,
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking"],
        )
        context = browser.new_context(viewport={"width": width, "height": 900})
        # Accelerate only the existing polling interval; never contact a real SMTP service.
        context.add_init_script("""
            const originalInterval = window.setInterval;
            window.setInterval = (callback, delay, ...args) =>
                originalInterval(callback, delay === 20000 ? 150 : delay, ...args);
        """)
        row = {
            "userId": "synthetic-user",
            "name": "Synthetic Invitation",
            "email": "browser-invite@example.com",
            "username": "browser-invite",
            "mailId": "synthetic-invitation",
            "mailStatus": "pending",
            "mailQueued": True,
            "mailSent": False,
            "mailError": None,
        }

        def route_request(route):
            url = urlparse(route.request.url)
            if url.netloc != urlparse(browser_server).netloc:
                route.abort()
            elif url.path == "/api/users/invite":
                submissions.append(route.request.method)
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(
                        {
                            "created": [row],
                            "skipped": [],
                            "failed": [],
                            "existing": [],
                        }
                    ),
                )
            elif url.path == "/api/users/invitation-status":
                status_reads.append(route.request.method)
                status = terminal_status if delivery_ready else "pending"
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(
                        {
                            "messages": [
                                {
                                    "mailId": row["mailId"],
                                    "mailStatus": status,
                                    "mailQueued": status == "pending",
                                    "mailSent": status == "sent",
                                    "mailError": "SMTP_AUTH_REJECTED"
                                    if status == "failed"
                                    else None,
                                }
                            ],
                        }
                    ),
                )
            else:
                route.continue_()

        context.route("**/*", route_request)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            login(page, browser_server, "admin")
            page.locator(".app-shell").wait_for()
            if width == 390:
                page.locator('[data-action="toggle-mobile-menu"]:visible').click()
            page.locator('[data-action="nav"][data-route="administracion"]:visible').first.click()
            page.locator('[data-action="open-invite-modal"]').click()
            form = page.locator('form[data-action="invite-workers-form"]')
            form.locator('[name="emails"]').fill("browser-invite@example.com")
            form.locator('button[type="submit"]').click()
            output = page.locator('[data-role="invitation-delivery"]')
            output.get_by_text("Pendiente de envío", exact=False).wait_for()
            delivery_ready = True
            expected = "Correo enviado" if terminal_status == "sent" else "Correo no enviado"
            output.get_by_text(expected, exact=False).wait_for(timeout=10000)
            assert "Pendiente de envío" not in output.inner_text()
            assert submissions == ["POST"]
            assert status_reads and set(status_reads) == {"GET"}
            assert errors == []
            page.locator('[data-action="close-modal"]').click()
            page.locator(".modal-overlay").wait_for(state="hidden")
        finally:
            context.close()
            browser.close()
