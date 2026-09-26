import os
import time
from playwright.sync_api import Page, expect

BASE_URL = "http://localhost:4200"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")

def test_tc04_doctor_leave_booking_conflict_detection(page: Page):
    """TC_04: Verify Doctor Leave Schedule Override & Patient Conflict Auto-Refund Warning Modal using Playwright."""
    # 1. Login as Doctor
    page.goto(f"{BASE_URL}/auth/login")
    page.wait_for_selector("#email")
    page.fill("#email", "alenkuriakose29@gmail.com")
    page.fill("#password", "Doctor@123")
    page.click("button[type='submit']")
    
    # 2. Wait for doctor redirect
    page.wait_for_url("**/doctor**", timeout=15000)
    assert "/doctor" in page.url
    
    # 3. Click "Manage Slots & Pricing (₹)" button
    manage_btn = page.locator("button:has-text('Manage Slots & Pricing')").first
    expect(manage_btn).to_be_visible(timeout=10000)
    manage_btn.click()
    
    # 4. Verify Schedule Modal opens
    schedule_modal = page.locator(".schedule-modal")
    expect(schedule_modal).to_be_visible(timeout=10000)
    expect(schedule_modal).to_contain_text("Weekly Schedule & Pricing Settings")
    
    # 5. Fill Single-Day Leave Form date and reason
    date_input = page.locator(".override-form input[type='date']")
    date_input.scroll_into_view_if_needed()
    
    page.evaluate("""
        () => {
            const input = document.querySelector(".override-form input[type='date']");
            input.value = '2026-09-25';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    """)
    page.wait_for_timeout(1000)
    
    reason_input = page.locator(".override-form input[type='text']")
    page.evaluate("""
        () => {
            const input = document.querySelector(".override-form input[type='text']");
            input.value = 'Medical Conference Attendance';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    """)
    page.wait_for_timeout(500)
    
    # 6. Click "+ Save Date Override"
    save_btn = page.locator("button:has-text('Save Date Override')")
    save_btn.scroll_into_view_if_needed()
    save_btn.click()
    
    # 7. Assert Leave Conflict Modal appears
    conflict_modal = page.locator(".leave-conflict-card")
    expect(conflict_modal).to_be_visible(timeout=10000)
    
    modal_text = conflict_modal.inner_text()
    assert "Active Bookings Conflict Detected" in modal_text
    assert "100% full Razorpay refund" in modal_text or "confirmed patient" in modal_text
    
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tc04_doctor_leave_conflict_modal.png"))
    
    # 8. Dismiss cleanly by clicking "Keep My Schedule"
    keep_btn = conflict_modal.locator("button:has-text('Keep My Schedule')")
    keep_btn.click()
    page.wait_for_timeout(1000)
    
    expect(conflict_modal).not_to_be_visible()

if __name__ == "__main__":
    import pytest
    import sys
    sys.exit(pytest.main([__file__, "-v"]))

