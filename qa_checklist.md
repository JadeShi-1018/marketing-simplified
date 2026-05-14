# QA Checklist — MED-203: Editable User Profile

**Branch:** `feature/MED-203-editable-user-profile`  
**Date:**  
**Tester:**  

---

## 1. Avatar Upload

- [ ] Click the avatar area on the profile page — file picker opens
- [ ] Select an image file (JPG / PNG) — avatar updates immediately on screen
- [ ] Refresh the page — uploaded avatar persists
- [ ] Avatar is visible in the top navigation bar after upload

---

## 2. Display Name (First / Last Name)

- [ ] Click the first name field — inline edit input appears
- [ ] Change the value and press Enter (or click away) — field saves
- [ ] Refresh the page — updated first name persists
- [ ] Repeat above steps for last name

---

## 3. Username

- [ ] Click the username field — inline edit input appears
- [ ] Change to a new unique username and save
- [ ] Refresh the page — updated username persists
- [ ] Attempt to save an empty username — shows validation error (does not save)

---

## 4. About Section (Role / Department / Location)

- [ ] Click the Job / Role row — inline edit appears
- [ ] Enter a value and save — row updates immediately
- [ ] Refresh the page — value persists
- [ ] Repeat above steps for Department
- [ ] Repeat above steps for Location

---

## 5. Organization Tab — Projects & Roles

- [ ] Click the "Organization" tab on the profile page
- [ ] Organization name is displayed at the top
- [ ] "Projects & Roles" section shows total project count (e.g., "2 projects")
- [ ] Each project card shows the project name and role badge
- [ ] **Multi-role edge case**: when user has different roles across projects (e.g., Owner in one, Member in another), projects are grouped by role with a group header and per-group count
- [ ] Owner badge is orange, Member badge is teal, Viewer badge is gray

---

## 6. Edge Cases

- [ ] Upload a non-image file (e.g., `.pdf`) — gracefully rejected or ignored
- [ ] Save a field with whitespace only — trimmed or rejected
- [ ] All changes made by one browser session are visible after logging out and back in
- [ ] User with only one role shows projects without role group headers (clean single-role view)

---

## Result

- [ ] **PASS** — all checks above passed, ready for PR
- [ ] **FAIL** — see notes below

**Notes:**  

