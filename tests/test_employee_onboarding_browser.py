"""Real Chromium against supervised web/PostgreSQL with synthetic invitations only."""

import shutil
from urllib.parse import urlparse

import pytest
from playwright.sync_api import sync_playwright
from test_browser import browser_server as browser_server
from test_browser import login
from test_employee_onboarding import invited as invited

pytestmark = [pytest.mark.postgres, pytest.mark.browser]


def open_browser(playwright, width):
    executable = shutil.which("chromium")
    if not executable:
        pytest.skip("Chromium is required for the isolated browser test")
    browser = playwright.chromium.launch(
        executable_path=executable,
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking"],
    )
    context = browser.new_context(
        viewport={"width": width, "height": 900}, timezone_id="Europe/Madrid"
    )
    return browser, context


def local_only(context, origin):
    external = []

    def route_request(route):
        if urlparse(route.request.url).netloc == urlparse(origin).netloc:
            route.continue_()
        else:
            external.append(route.request.url)
            route.abort()

    context.route("**/*", route_request)
    return external


@pytest.mark.parametrize("width", [1365, 390])
def test_employee_completes_registration_and_logs_in_in_browser(browser_server, invited, width):
    with sync_playwright() as playwright:
        browser, context = open_browser(playwright, width)
        external = local_only(context, browser_server)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.goto(browser_server + "/activate#token=" + invited["token"])
            form = page.locator("#activation-form")
            form.wait_for(state="visible")
            assert "#" not in page.url
            assert page.locator("#activation-email").input_value() == "register@example.com"
            assert page.locator("#activation-email").get_attribute("readonly") is not None
            form.locator('[name="name"]').fill("Synthetic Browser Registration")
            form.locator('[name="newPassword"]').fill("b" * 7)
            assert not form.locator('[name="newPassword"]').evaluate("e => e.checkValidity()")
            form.locator('[name="newPassword"]').fill("b" * 8)
            form.locator('[name="confirmPassword"]').fill("c" * 8)
            assert not form.evaluate("e => e.checkValidity()")  # Birthday is required.
            form.locator('[name="birthDate"]').fill("1991-02-18")
            form.locator('button[type="submit"]').click()
            page.locator("#activation-error").get_by_text(
                "Las contraseñas no coinciden."
            ).wait_for()
            form.locator('[name="confirmPassword"]').fill("b" * 8)
            assert not form.locator('[name="shareBirthday"]').is_checked()
            with page.expect_response(
                lambda r: r.url.endswith("/api/activation/complete")
            ) as response:
                form.locator('button[type="submit"]').click()
            assert response.value.status == 200, response.value.text()
            page.locator("#activation-success").wait_for(state="visible")
            assert "cuenta está activada" in page.locator("#activation-success").inner_text()
            form.wait_for(state="hidden")
            page.get_by_role("link", name="Ir al inicio de sesión").click()
            login_form = page.locator('form[data-action="login-form"]')
            login_form.wait_for()
            login_form.locator('[name="username"]').fill(invited["username"])
            login_form.locator('[name="password"]').fill("b" * 8)
            login_form.locator('button[type="submit"]').click()
            page.locator(".app-shell").wait_for()
            assert not errors and not external
        finally:
            context.close()
            browser.close()


@pytest.mark.parametrize("width", [1365, 390])
def test_admin_lifecycle_buttons_and_deletion_confirmation_in_browser(browser_server, width):
    with sync_playwright() as playwright:
        browser, context = open_browser(playwright, width)
        external = local_only(context, browser_server)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            login(page, browser_server, "admin")
            page.locator(".app-shell").wait_for()
            if width == 390:
                page.locator('[data-action="toggle-mobile-menu"]:visible').click()
            page.locator('[data-action="nav"][data-route="administracion"]:visible').first.click()
            assert page.locator('[data-action="manage-worker"][data-id="test-admin"]').count() == 0
            for operation, following in [("deactivate", "activate"), ("activate", "deactivate")]:
                page.locator(
                    f'[data-action="manage-worker"][data-id="test-worker"][data-operation="{operation}"]'
                ).click()
                form = page.locator('form[data-action="manage-worker-form"]')
                with page.expect_response(
                    lambda r: (
                        r.url.endswith("/api/users/test-worker") and r.request.method == "PATCH"
                    )
                ) as response:
                    form.locator('button[type="submit"]').click()
                assert response.value.status == 200, response.value.text()
                form.wait_for(state="hidden")
                page.locator(f'[data-id="test-worker"][data-operation="{following}"]').wait_for()
            page.locator('[data-action="open-edit-worker-modal"][data-id="test-coworker"]').click()
            edit_form = page.locator('form[data-action="edit-worker-form"]')
            edit_form.wait_for()
            edit_form.get_by_role("button", name="Eliminar trabajador").click()
            form = page.locator('form[data-action="manage-worker-form"]')
            form.locator('[name="confirmation"]').fill("incorrecto")
            form.locator('button[type="submit"]').click()
            page.get_by_text(
                "Escribe el usuario exacto para confirmar la eliminación.", exact=True
            ).wait_for()
            form.locator('[name="confirmation"]').fill("coworker")
            with page.expect_response(
                lambda r: r.url.endswith("/api/users/test-coworker/remove")
            ) as response:
                form.locator('button[type="submit"]').click()
            assert response.value.status == 200, response.value.text()
            form.wait_for(state="hidden")
            page.locator('[data-id="test-coworker"][data-operation="remove"]').wait_for(
                state="hidden"
            )
            assert not errors and not external
        finally:
            context.close()
            browser.close()
