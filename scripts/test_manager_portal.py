"""
scripts/test_manager_portal.py - Automated verification of Manager Portal routes and security boundaries
"""

import requests
import sys

BASE_URL = "http://127.0.0.1:3000"

def test_manager_portal():
    print("[*] Running Manager Portal Automated Tests...")

    # 1. Unauthenticated access check
    r = requests.get(f"{BASE_URL}/api/v1/manager/dashboard")
    print(f"1. Unauthenticated /manager/dashboard status: {r.status_code}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

    # 2. Employee login - role boundary check
    emp_session = requests.Session()
    r = emp_session.post(f"{BASE_URL}/api/v1/employee/login", json={
        "identifier": "EMP-002",
        "password": "password123"
    })
    print(f"2a. Employee login status: {r.status_code}")
    r = emp_session.get(f"{BASE_URL}/api/v1/manager/dashboard")
    print(f"2b. Employee accessing /manager/dashboard status: {r.status_code}")
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"

    # 3. Manager login (Vikram Sharma MGR-001)
    mgr_session = requests.Session()
    r = mgr_session.post(f"{BASE_URL}/api/v1/employee/login", json={
        "identifier": "vikram.sharma@enterprise.internal",
        "password": "password123"
    })
    print(f"3a. Manager login status: {r.status_code}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert r.json().get("role") == "manager"

    # 3b. Fetch Manager Dashboard
    r = mgr_session.get(f"{BASE_URL}/api/v1/manager/dashboard")
    print(f"3b. Manager dashboard status: {r.status_code}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    dash_data = r.json()
    print(f"    - Total team: {dash_data.get('total_team')}")
    print(f"    - Checked in: {dash_data.get('checked_in_count')}")
    print(f"    - Late count: {dash_data.get('late_count')}")
    print(f"    - Pending corrections: {dash_data.get('pending_corrections')}")
    assert dash_data.get("total_team", 0) > 0, "Expected non-empty team members"

    # 4. Fetch Team Attendance Records
    r = mgr_session.get(f"{BASE_URL}/api/v1/manager/attendance")
    print(f"4a. Manager attendance records status: {r.status_code}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    att_data = r.json()
    records = att_data.get("records", [])
    team_members = att_data.get("team_members", [])
    print(f"    - Records count: {len(records)}")
    print(f"    - Team members count: {len(team_members)}")
    assert len(records) > 0, "Expected attendance records"

    # 4b. Filter by specific managed employee
    sample_emp = team_members[0]
    r = mgr_session.get(f"{BASE_URL}/api/v1/manager/attendance?employee_id={sample_emp['id']}")
    print(f"4b. Filtered attendance by emp {sample_emp['id']} status: {r.status_code}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"

    # 4c. Scope enforcement: Attempt to filter by an employee NOT in this manager's team
    # Check unauthorized employee id (e.g. 99999 or employee in another dept)
    r = mgr_session.get(f"{BASE_URL}/api/v1/manager/attendance?employee_id=999999")
    print(f"4c. Unauthorized employee filter status: {r.status_code}")
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"

    # 5. Fetch Correction Requests
    r = mgr_session.get(f"{BASE_URL}/api/v1/manager/correction-requests")
    print(f"5a. Manager correction requests status: {r.status_code}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    corr_data = r.json()
    print(f"    - Requests count: {len(corr_data.get('requests', []))}")

    # 6. Test Correction Request lifecycle:
    # 6a. Employee submits correction request
    r = emp_session.post(f"{BASE_URL}/api/v1/employee/correction-request", json={
        "attendance_date": "2026-10-23",
        "reason": "Test punch correction via Next.js proxy",
        "requested_change": "Adjust check-in from 09:45 to 09:00 AM"
    })
    print(f"6a. Employee correction submit status: {r.status_code}")
    assert r.status_code == 201 or r.status_code == 200, f"Expected 201/200, got {r.status_code}"

    # 6b. Manager sees pending correction
    r = mgr_session.get(f"{BASE_URL}/api/v1/manager/correction-requests")
    corr_list = r.json().get("requests", [])
    pending_items = [cr for cr in corr_list if cr.get("status") == "pending"]
    print(f"6b. Pending corrections count for manager: {len(pending_items)}")
    assert len(pending_items) > 0, "Expected at least 1 pending correction"

    target_cr = pending_items[0]
    # 6c. Manager approves correction request
    r = mgr_session.post(f"{BASE_URL}/api/v1/manager/correction-requests/{target_cr['id']}/review", json={
        "action": "approve",
        "review_note": "Verified by manager during Next.js test verification"
    })
    print(f"6c. Manager review action status: {r.status_code}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    res_data = r.json()
    assert res_data.get("status") == "approved" or res_data.get("ok") is True

    # 6d. Check updated status
    r = mgr_session.get(f"{BASE_URL}/api/v1/manager/correction-requests")
    updated_cr = next((cr for cr in r.json().get("requests", []) if cr["id"] == target_cr["id"]), None)
    assert updated_cr is not None
    print(f"6d. Updated correction status: {updated_cr.get('status')}, note: {updated_cr.get('review_note')}")
    assert updated_cr.get("status") == "approved"

    print("\n[SUCCESS] ALL MANAGER PORTAL AND SECURITY TESTS PASSED!")

if __name__ == "__main__":
    test_manager_portal()
