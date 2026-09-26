import os
import time
from playwright.sync_api import Page, expect

BASE_URL = "http://localhost:4200"
TEST_APPOINTMENT_ID = "6aac18b694a97c1d509ae275"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")

def test_tc05_telehealth_video_consultation_lobby_and_call(page: Page):
    """TC_05: Verify Telehealth Video Consultation Lobby, Pre-Call Device Diagnostics & In-Call Session Interface using Playwright."""
    # 1. Login as Patient
    page.goto(f"{BASE_URL}/auth/login")
    page.wait_for_selector("#email")
    page.fill("#email", "justinsaji2412@gmail.com")
    page.fill("#password", "Justin@123")
    page.click("button[type='submit']")
    
    # 2. Wait for patient redirect
    page.wait_for_url("**/patient**", timeout=15000)
    assert "/patient" in page.url
    
    # 3. Navigate to the consultation room
    page.goto(f"{BASE_URL}/consultation/{TEST_APPOINTMENT_ID}")
    
    # 4. Wait for Pre-call container to load
    pre_call_card = page.locator(".pre-call-card")
    expect(pre_call_card).to_be_visible(timeout=15000)
    
    # 5. Assert Pre-call Lobby components
    expect(pre_call_card).to_contain_text("Ready to Join Consultation?")
    expect(pre_call_card).to_contain_text("Check your camera and microphone preview below")
    
    # Verify video preview container & controls
    video_preview = page.locator(".video-preview-box video")
    expect(video_preview).to_be_visible(timeout=10000)
    
    # Verify Device Controls (Mic / Camera buttons)
    device_controls = page.locator(".device-controls button")
    assert device_controls.count() >= 2
    
    # Verify Join Consultation button
    join_btn = page.locator(".pre-call-card button.btn-success")
    expect(join_btn).to_be_visible(timeout=10000)
    expect(join_btn).to_contain_text("Join Consultation Room")
    
    # 6. Capture Pre-call Lobby Screenshot
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tc05_video_consultation_lobby.png"))
    
    # 7. Click Join Consultation Room
    join_btn.click()
    page.wait_for_timeout(2000)
    
    # 8. Verify transition to In-Call Stage
    in_call_stage = page.locator(".in-call-stage, .call-controls, .consultation-container").first
    expect(in_call_stage).to_be_visible(timeout=10000)
    
    # Verify Telehealth brand title in header
    brand_title = page.locator(".brand-title")
    expect(brand_title).to_contain_text("CarePath AI")
    
    # Capture In-call Active Session Screenshot
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tc05_video_consultation_active_room.png"))
    
    # Gracefully click Exit
    exit_btn = page.locator(".consultation-header button:has-text('Exit')").first
    exit_btn.click()
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    import pytest
    import sys
    sys.exit(pytest.main([__file__, "-v"]))

