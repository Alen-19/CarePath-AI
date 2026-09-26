import os
from playwright.sync_api import Page, expect

BASE_URL = "http://localhost:4200"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def test_tc01_patient_login(page: Page):
    """TC_01A: Verify Patient login redirect to Patient Dashboard using Playwright."""
    page.goto(f"{BASE_URL}/auth/login")
    page.wait_for_selector("#email")
    page.fill("#email", "justinsaji2412@gmail.com")
    page.fill("#password", "Justin@123")
    page.click("button[type='submit']")
    
    page.wait_for_url("**/patient**", timeout=15000)
    assert "/patient" in page.url
    
    expect(page.locator(".dashboard-title, h1, .welcome-text").first).to_be_visible()
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tc01_patient_login_success.png"))

def test_tc01_doctor_login(page: Page):
    """TC_01B: Verify Doctor login redirect to Doctor Clinical Dashboard using Playwright."""
    page.goto(f"{BASE_URL}/auth/login")
    page.wait_for_selector("#email")
    page.fill("#email", "alenkuriakose29@gmail.com")
    page.fill("#password", "Doctor@123")
    page.click("button[type='submit']")
    
    page.wait_for_url("**/doctor**", timeout=15000)
    assert "/doctor" in page.url
    
    expect(page.locator(".welcome-banner, h1").first).to_be_visible()
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tc01_doctor_login_success.png"))

def test_tc01_invalid_credentials_error(page: Page):
    """TC_01C: Verify system blocks authentication on invalid password using Playwright."""
    page.goto(f"{BASE_URL}/auth/login")
    page.wait_for_selector("#email")
    page.fill("#email", "justinsaji2412@gmail.com")
    page.fill("#password", "WrongPassword@999")
    page.click("button[type='submit']")
    
    error_alert = page.locator(".alert-danger, .error-message, .alert").first
    expect(error_alert).to_be_visible(timeout=10000)
    text = error_alert.text_content().lower()
    assert "invalid" in text or "incorrect" in text
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tc01_invalid_credentials_error.png"))

if __name__ == "__main__":
    import pytest
    import sys
    sys.exit(pytest.main([__file__, "-v"]))

