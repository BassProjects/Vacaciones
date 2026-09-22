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
