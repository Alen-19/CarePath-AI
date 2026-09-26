import os
import time
from playwright.sync_api import Page, expect

BASE_URL = "http://localhost:4200"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")

def test_tc02_admin_doctor_verification_workflow(page: Page):
    """TC_02: Verify Administrator can inspect doctor credentials, medical license, and trigger verification using Playwright."""
    # 1. Login as Admin
    page.goto(f"{BASE_URL}/auth/login")
    page.wait_for_selector("#email")
    page.fill("#email", "carepathaiadmin@gmail.com")
    page.fill("#password", "Admin@123")
    page.click("button[type='submit']")
    
    # 2. Wait for admin redirect
    page.wait_for_url("**/admin**", timeout=15000)
    assert "/admin" in page.url
    
    # 3. Check for pending or switch to Approved Doctors tab
    page.wait_for_selector(".table-card-section")
    approved_tab = page.locator(".tab-btn:has-text('Approved Doctors')")
    expect(approved_tab).to_be_visible(timeout=10000)
    approved_tab.click()
    page.wait_for_timeout(1000)
    
    # 4. Click doctor row to open Doctor Verification Modal
    doctor_row = page.locator(".doctor-row").first
    expect(doctor_row).to_be_visible(timeout=10000)
    doctor_row.click()
    
    # 5. Verify Doctor Verification Modal opened
    modal = page.locator(".modal-backdrop .modal-card")
    expect(modal).to_be_visible(timeout=10000)
    
    # Check modal contents
    expect(modal.locator("h3")).to_contain_text("Doctor Account & Verification File")
    
    # Verify presence of Doctor Name, Medical License
    modal_text = modal.inner_text()
    assert "Dr." in modal_text
    assert "MEDICAL LICENSE NUMBER" in modal_text.upper()
    
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tc02_admin_doctor_verification_modal.png"))
    
    # 6. Dismiss Modal
    close_btn = modal.locator(".modal-close-btn").first
    close_btn.click()

if __name__ == "__main__":
    import pytest
    import sys
    sys.exit(pytest.main([__file__, "-v"]))

