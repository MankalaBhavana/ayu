# HospAI Backend API Reference & Route Directory

> Comprehensive specification of all backend REST API routes in HospAI / Ayu Polyclinic & Emergency Clinic. Automatically generated and synchronized with FastAPI endpoints.

**Total Registered Endpoints:** 275 paths | **356 HTTP Operations**  
**Base URL:** `http://127.0.0.1:8000` (Local) / Current Cloudflare Tunnel  
**Authentication:** Cookie-based Session (`hospai_session`) or Bearer token; Tenant isolation via `X-Hospital-Code` header.

---

## Table of Contents

- [Authentication & Session Management (#authentication-session-management)](#authentication-session-management) — *17 routes*
- [Platform & Multi-Hospital Administration (#platform-multi-hospital-administration)](#platform-multi-hospital-administration) — *5 routes*
- [Patients & Identity Management (#patients-identity-management)](#patients-identity-management) — *23 routes*
- [Clinical Consultations & OP Workflow (#clinical-consultations-op-workflow)](#clinical-consultations-op-workflow) — *29 routes*
- [Employees, Wards & IP Bed Allocations (#employees-wards-ip-bed-allocations)](#employees-wards-ip-bed-allocations) — *44 routes*
- [Billing, Invoices & Collections (#billing-invoices-collections)](#billing-invoices-collections) — *38 routes*
- [Pharmacy Operations & Inventory (#pharmacy-operations-inventory)](#pharmacy-operations-inventory) — *52 routes*
- [eMAR (Electronic Medication Administration) (#emar-electronic-medication-administration)](#emar-electronic-medication-administration) — *6 routes*
- [Laboratory & Diagnostic Services (#laboratory-diagnostic-services)](#laboratory-diagnostic-services) — *68 routes*
- [Ancillary Operations (OT, Legacy Lab, Finance & HR) (#ancillary-operations-ot-legacy-lab-finance-hr)](#ancillary-operations-ot-legacy-lab-finance-hr) — *53 routes*
- [Executive Analytics & Financial Reports (#executive-analytics-financial-reports)](#executive-analytics-financial-reports) — *14 routes*
- [System Configuration & Master Dropdowns (#system-configuration-master-dropdowns)](#system-configuration-master-dropdowns) — *4 routes*
- [System & Infrastructure Endpoints (#system-infrastructure-endpoints)](#system-infrastructure-endpoints) — *3 routes*

---

## Standard Request & Response Headers

| Header | Required | Type | Description |
| :--- | :--- | :--- | :--- |
| `Content-Type` | Optional (`application/json`) | String | Must be `application/json` for POST/PUT requests with payloads. |
| `X-Hospital-Code` | Optional (default: `sri_raksha`) | String | Scopes all database queries to the targeted hospital tenant database partition. |
| `Cookie` | Required for protected routes | String | Session cookie `hospai_session` obtained upon successful login. |
| `X-Platform-Admin-Username` | Platform routes only | String | Superadmin credential for platform tenant management. |
| `X-Platform-Admin-Password` | Platform routes only | String | Superadmin credential for platform tenant management. |

---

## Authentication & Session Management

_User login, session validation, registration, password management, and admin route protection._

**Route Count:** 17

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`POST`** | `/api/admin/auth/login` | Admin Route Auth Login | - | Payload |
| **`POST`** | `/api/admin/auth/logout` | Admin Route Auth Logout | - | - |
| **`GET`** | `/api/admin/auth/session` | Admin Route Auth Session | - | - |
| **`POST`** | `/api/admin/create-account` | Admin Create Account | - | Payload |
| **`GET`** | `/api/admin/users` | Admin Users List | - | - |
| **`POST`** | `/api/admin/users` | Admin Users Create | - | Payload |
| **`PUT`** | `/api/admin/users/{employee_id}` | Admin Users Update | - | Payload |
| **`POST`** | `/api/admin/users/{employee_id}/promote` | Admin Promote User | - | - |
| **`GET`** | `/api/auth/check-username` | Check Username | `username` | - |
| **`POST`** | `/api/auth/login` | Login | - | Payload |
| **`POST`** | `/api/auth/logout` | Auth Logout | - | - |
| **`GET`** | `/api/auth/session` | Auth Session | - | - |
| **`POST`** | `/api/auth/setup-admin` | Setup Hospital Admin | - | Payload |
| **`POST`** | `/api/auth/signup` | Signup | - | Payload |
| **`GET`** | `/api/health` | Health | - | - |
| **`GET`** | `/api/languages` | Languages | - | - |
| **`GET`** | `/api/payments/razorpay/config` | Razorpay Config | - | - |

---

## Platform & Multi-Hospital Administration

_Multi-tenant hospital registration, tenant activation/deactivation, and superadmin operations._

**Route Count:** 5

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/platform/hospitals` | Platform Hospitals List | - | - |
| **`POST`** | `/api/platform/hospitals` | Platform Hospitals Create | - | Payload |
| **`POST`** | `/api/platform/hospitals/{hospital_code}/admin/reset-password` | Platform Admin Reset Password | - | Payload |
| **`POST`** | `/api/platform/hospitals/{hospital_code}/disable` | Platform Hospital Disable | - | Payload |
| **`POST`** | `/api/platform/hospitals/{hospital_code}/enable` | Platform Hospital Enable | - | - |

---

## Patients & Identity Management

_Patient records, demographic profile, UHID registration, search, and consents._

**Route Count:** 23

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`DELETE`** | `/api/documents/{document_id}` | Document Delete | - | - |
| **`GET`** | `/api/documents/{document_id}/file` | Document File | - | - |
| **`POST`** | `/api/documents/{document_id}/ocr` | Document Process Ocr | - | Payload |
| **`GET`** | `/api/export/patients/csv` | Export Patients Csv | `q` | - |
| **`POST`** | `/api/export/pdf` | Export Pdf | - | Payload |
| **`POST`** | `/api/export/word` | Export Word | - | Payload |
| **`GET`** | `/api/insurance-providers` | Insurance Providers List | - | - |
| **`POST`** | `/api/insurance-providers` | Insurance Providers Create | - | Payload |
| **`POST`** | `/api/ocr` | Ocr Extract | - | JSON |
| **`GET`** | `/api/patients` | Patients List | `q`, `visit_status` | - |
| **`POST`** | `/api/patients` | Patients Create | - | Payload |
| **`GET`** | `/api/patients/next-id` | Patients Next Id | - | - |
| **`DELETE`** | `/api/patients/{patient_id}` | Patients Delete | - | - |
| **`GET`** | `/api/patients/{patient_id}` | Patients Read | - | - |
| **`PUT`** | `/api/patients/{patient_id}` | Patients Update | - | Payload |
| **`GET`** | `/api/patients/{patient_id}/active-admission` | Patient Active Admission | - | - |
| **`GET`** | `/api/patients/{patient_id}/admissions` | Admissions List | - | - |
| **`POST`** | `/api/patients/{patient_id}/admissions` | Admissions Create | - | Payload |
| **`GET`** | `/api/patients/{patient_id}/documents` | Documents List | - | - |
| **`POST`** | `/api/patients/{patient_id}/documents` | Documents Create | - | JSON |
| **`GET`** | `/api/patients/{patient_id}/journey` | Patients Journey | `encounter_type`, `encounter_id` | - |
| **`GET`** | `/api/patients/{patient_id}/last-consultation` | Get Patient Last Consultation | - | - |
| **`POST`** | `/api/patients/{patient_id}/verify-insurance` | Patients Verify Insurance | - | Payload |

---

## Clinical Consultations & OP Workflow

_Outpatient clinic workflow, doctor appointments, token queues, clinical vitals, doctor history, and prescriptions._

**Route Count:** 29

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/appointments` | Appointments List | `date`, `status`, `visit_type`, `doctor_name`, `patient_id` | - |
| **`POST`** | `/api/appointments` | Appointments Create | - | Payload |
| **`POST`** | `/api/appointments/razorpay/order` | Appointments Razorpay Order | - | Payload |
| **`POST`** | `/api/appointments/razorpay/verify` | Appointments Razorpay Verify | - | Payload |
| **`PUT`** | `/api/appointments/{appointment_id}` | Appointments Update | - | Payload |
| **`GET`** | `/api/dashboard/analytics` | Dashboard Analytics | `days`, `date`, `target_date` | - |
| **`GET`** | `/api/dashboard/hospital-summary` | Dashboard Hospital Summary | `date`, `target_date` | - |
| **`GET`** | `/api/dashboard/stats` | Stats | `date` | - |
| **`GET`** | `/api/dashboard/summary` | Dashboard Hospital Summary | `date`, `target_date` | - |
| **`GET`** | `/api/doctors-history` | Doctors History List | `doctor_name`, `from_date`, `to_date`, `department` | - |
| **`GET`** | `/api/hospital/summary` | Dashboard Hospital Summary | `date`, `target_date` | - |
| **`GET`** | `/api/op/doctor-schedules` | Op Doctor Schedules List | `date`, `doctor_name`, `status`, `department` | - |
| **`POST`** | `/api/op/doctor-schedules` | Op Doctor Schedules Create | - | Payload |
| **`DELETE`** | `/api/op/doctor-schedules/{schedule_id}` | Op Doctor Schedules Delete | - | - |
| **`PUT`** | `/api/op/doctor-schedules/{schedule_id}` | Op Doctor Schedules Update | - | Payload |
| **`GET`** | `/api/op/doctors` | Op Doctors List | `department` | - |
| **`GET`** | `/api/op/summary` | Op Summary | `date` | - |
| **`GET`** | `/api/prescriptions` | Prescriptions List | `patient_id` | - |
| **`POST`** | `/api/prescriptions` | Prescriptions Create | - | Payload |
| **`GET`** | `/api/registration/consents` | Registration Consents List | `patient_id` | - |
| **`POST`** | `/api/registration/consents` | Registration Consents Create | - | Payload |
| **`PUT`** | `/api/registration/consents/{consent_id}` | Registration Consents Update | - | Payload |
| **`GET`** | `/api/registration/departments` | Registration Departments List | - | - |
| **`POST`** | `/api/registration/departments` | Registration Departments Create | - | Payload |
| **`DELETE`** | `/api/registration/departments/{department_id}` | Registration Departments Delete | - | - |
| **`GET`** | `/api/registration/insurance` | Registration Insurance List | `patient_id` | - |
| **`POST`** | `/api/registration/insurance` | Registration Insurance Create | - | Payload |
| **`PUT`** | `/api/registration/insurance/{verification_id}` | Registration Insurance Update | - | Payload |
| **`GET`** | `/api/stats` | Stats | `date` | - |

---

## Employees, Wards & IP Bed Allocations

_Staff and doctor management, module permissions, IP ward bed allocation, transfers, and bed occupancy._

**Route Count:** 44

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/admissions/discharged` | Admissions Discharged List | `from_date`, `to_date`, `q` | - |
| **`POST`** | `/api/admissions/{admission_id}/discharge` | Admission Discharge Execute | - | Payload |
| **`GET`** | `/api/admissions/{admission_id}/discharge-bill` | Admission Discharge Bill Preview | - | - |
| **`GET`** | `/api/admissions/{identifier}/summary-data` | Admission Summary Data | - | - |
| **`POST`** | `/api/bed/allocations/{allocation_id}/discharge` | Bed Allocation Discharge Execute | - | Payload |
| **`GET`** | `/api/bed/allocations/{allocation_id}/discharge-bill` | Bed Allocation Discharge Bill Preview | - | - |
| **`POST`** | `/api/bed/allot` | Allot Bed Api | - | Payload |
| **`GET`** | `/api/bed/config` | Get Bed Config | - | - |
| **`POST`** | `/api/bed/config` | Update Bed Config | - | Payload |
| **`GET`** | `/api/bed/history` | Get Bed History All | `patient_id` | - |
| **`GET`** | `/api/bed/occupancy` | Get Bed Occupancy | - | - |
| **`POST`** | `/api/bed/release/{allocation_id}` | Release Bed Api | - | - |
| **`GET`** | `/api/bed/requests` | Get Bed Requests | - | - |
| **`GET`** | `/api/beds` | Api List Hospital Beds | `ward`, `status` | - |
| **`POST`** | `/api/beds` | Api Create Hospital Bed | - | Payload |
| **`POST`** | `/api/beds/status` | Api Update Hospital Bed Status | - | Payload |
| **`DELETE`** | `/api/certificates/{certificate_id}` | Patient Certificates Delete | - | - |
| **`GET`** | `/api/employees` | Employees List | - | - |
| **`POST`** | `/api/employees` | Employees Create | - | Payload |
| **`GET`** | `/api/employees/search` | Employees Search | `q` | - |
| **`GET`** | `/api/employees/stats` | Employees Stats | - | - |
| **`DELETE`** | `/api/employees/{employee_id}` | Employees Delete | - | - |
| **`GET`** | `/api/employees/{employee_id}` | Employees Get | - | - |
| **`PUT`** | `/api/employees/{employee_id}` | Employees Update | - | Payload |
| **`POST`** | `/api/employees/{employee_id}/activate` | Employees Activate | - | - |
| **`POST`** | `/api/employees/{employee_id}/deactivate` | Employees Deactivate | - | - |
| **`GET`** | `/api/encounters` | Encounters List | `encounter_type`, `active_only` | - |
| **`POST`** | `/api/encounters/{encounter_id}/disposition` | Encounter Set Disposition | - | Payload |
| **`GET`** | `/api/nursing/care-logs` | Nursing Care Logs List | `patient_id`, `admission_id` | - |
| **`POST`** | `/api/nursing/care-logs` | Nursing Care Logs Create | - | Payload |
| **`GET`** | `/api/patients/{patient_id}/beds` | Patient Beds | `active_only` | - |
| **`POST`** | `/api/patients/{patient_id}/beds` | Patient Bed Assign | - | Payload |
| **`GET`** | `/api/patients/{patient_id}/certificates` | Patient Certificates | - | - |
| **`POST`** | `/api/patients/{patient_id}/certificates` | Patient Certificates Create | - | Payload |
| **`GET`** | `/api/patients/{patient_id}/encounters` | Patient Encounters | - | - |
| **`POST`** | `/api/patients/{patient_id}/encounters` | Patient Encounter Create | - | Payload |
| **`GET`** | `/api/patients/{patient_id}/medications` | Patient Medications | `pending_only` | - |
| **`POST`** | `/api/patients/{patient_id}/medications` | Patient Medications Create | - | Payload |
| **`GET`** | `/api/patients/{patient_id}/movements` | Patient Movements | - | - |
| **`POST`** | `/api/patients/{patient_id}/movements` | Patient Movements Create | - | Payload |
| **`GET`** | `/api/patients/{patient_id}/notes` | Patient Notes | - | - |
| **`POST`** | `/api/patients/{patient_id}/notes` | Patient Notes Create | - | Payload |
| **`GET`** | `/api/patients/{patient_id}/vitals` | Patient Vitals List | `admission_id` | - |
| **`POST`** | `/api/patients/{patient_id}/vitals` | Patient Vitals Create | - | Payload |

---

## Billing, Invoices & Collections

_Patient invoices, cash/insurance payments, partial due collections, doctor payouts, day close, and Razorpay integration._

**Route Count:** 38

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/billing/advances` | Billing Advances List | `patient_id`, `admission_id` | - |
| **`POST`** | `/api/billing/advances` | Billing Advances Create | - | Payload |
| **`POST`** | `/api/billing/cashier-session/close` | Billing Cashier Session Close | - | Payload |
| **`GET`** | `/api/billing/cashier-session/current` | Billing Cashier Session Current | `counter` | - |
| **`POST`** | `/api/billing/cashier-session/open` | Billing Cashier Session Open | - | Payload |
| **`GET`** | `/api/billing/claims` | Billing Claims | `invoice_id`, `status` | - |
| **`POST`** | `/api/billing/claims` | Billing Create Claim | - | Payload |
| **`DELETE`** | `/api/billing/claims/{claim_id}` | Billing Delete Claim | - | - |
| **`PUT`** | `/api/billing/claims/{claim_id}` | Billing Update Claim | - | Payload |
| **`POST`** | `/api/billing/collect-multi` | Billing Collect Multi | - | Payload |
| **`POST`** | `/api/billing/direct-payment` | Billing Direct Payment | - | Payload |
| **`GET`** | `/api/billing/doctor-payouts/details` | Billing Doctor Payouts Details | `metric` (req), `month`, `department`, `q` | - |
| **`POST`** | `/api/billing/doctor-payouts/statements/{statement_id}/pay` | Billing Doctor Payouts Pay | - | Payload |
| **`GET`** | `/api/billing/doctor-payouts/summary` | Billing Doctor Payouts Summary | `month`, `department`, `q` | - |
| **`GET`** | `/api/billing/invoices` | Billing Invoices | `patient_id`, `module` | - |
| **`POST`** | `/api/billing/invoices` | Billing Create Invoice | - | Payload |
| **`DELETE`** | `/api/billing/invoices/{invoice_id}` | Billing Delete Invoice | - | - |
| **`PUT`** | `/api/billing/invoices/{invoice_id}` | Billing Update Invoice | - | Payload |
| **`POST`** | `/api/billing/invoices/{invoice_id}/payments` | Billing Record Payment | - | Payload |
| **`POST`** | `/api/billing/ip-discharge/finalise` | Billing Ip Discharge Finalise | - | Payload |
| **`GET`** | `/api/billing/ip-discharge/{admission_id}` | Billing Ip Discharge | - | - |
| **`GET`** | `/api/billing/overview-details` | Billing Overview Details | `metric` (req), `date` | - |
| **`GET`** | `/api/billing/overview-stats` | Billing Overview Stats | `date`, `cashier`, `counter` | - |
| **`GET`** | `/api/billing/patient-bills/{patient_id}` | Billing Patient Bills | - | - |
| **`POST`** | `/api/billing/razorpay/order` | Billing Razorpay Order | - | Payload |
| **`POST`** | `/api/billing/razorpay/verify` | Billing Razorpay Verify | - | Payload |
| **`POST`** | `/api/billing/refunds/request` | Billing Refunds Request | - | Payload |
| **`POST`** | `/api/billing/refunds/{refund_id}/approve` | Billing Refunds Approve | - | - |
| **`POST`** | `/api/billing/refunds/{refund_id}/pay` | Billing Refunds Pay | - | Payload |
| **`POST`** | `/api/billing/refunds/{refund_id}/reject` | Billing Refunds Reject | - | Payload |
| **`GET`** | `/api/billing/reports/data` | Billing Reports Data | `date`, `cashier`, `counter` | - |
| **`GET`** | `/api/billing/reports/day-close-history` | Billing Reports Day Close History | `limit` | - |
| **`GET`** | `/api/billing/reports/department` | Billing Reports Department | `date`, `end_date` | - |
| **`GET`** | `/api/billing/reports/export` | Billing Reports Export | `date` | - |
| **`GET`** | `/api/billing/reports/monthly` | Billing Reports Monthly | `month` | - |
| **`GET`** | `/api/billing/revenue-by-date` | Billing Revenue By Date | `date` | - |
| **`GET`** | `/api/billing/revenue-summary` | Billing Revenue Summary | `date`, `month` | - |
| **`GET`** | `/api/billing/worklist` | Billing Worklist | `tab`, `department`, `visit_type`, `q`, `target_date` | - |

---

## Pharmacy Operations & Inventory

_Real-time medicine master, batch FEFO dispensing, stock movements, purchase requisitions (PR), purchase orders (PO), goods receipt notes (GRN), and supplier ledgers._

**Route Count:** 52

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`POST`** | `/api/pharmacy/dispense` | Pharmacy Dispense | - | Payload |
| **`GET`** | `/api/pharmacy/dues` | Pharmacy Get Dues | `id` (req) | - |
| **`GET`** | `/api/pharmacy/external-customers` | Pharmacy External Customers | `q` | - |
| **`GET`** | `/api/pharmacy/goods-receipts` | Pharmacy Goods Receipts List | - | - |
| **`POST`** | `/api/pharmacy/goods-receipts` | Pharmacy Goods Receipts Create | - | Payload |
| **`POST`** | `/api/pharmacy/goods-receipts/{grn_id}/verify` | Pharmacy Goods Receipts Verify | - | - |
| **`GET`** | `/api/pharmacy/insurance-cases` | Pharmacy Insurance Cases List | `invoice_id`, `status` | - |
| **`PUT`** | `/api/pharmacy/insurance-cases/{claim_id}` | Pharmacy Insurance Case Update | - | Payload |
| **`POST`** | `/api/pharmacy/insurance-cases/{claim_id}/settle` | Pharmacy Insurance Case Settle | - | Payload |
| **`GET`** | `/api/pharmacy/invoices` | Pharmacy Invoices List | `patient_id` | - |
| **`GET`** | `/api/pharmacy/invoices/{invoice_id}` | Pharmacy Invoice Get | - | - |
| **`POST`** | `/api/pharmacy/invoices/{invoice_id}/payment` | Pharmacy Invoice Payment | - | Payload |
| **`GET`** | `/api/pharmacy/medicines` | Pharmacy Medicines List | `active_only` | - |
| **`POST`** | `/api/pharmacy/medicines` | Pharmacy Medicines Create | - | Payload |
| **`PUT`** | `/api/pharmacy/medicines/{medicine_id}` | Pharmacy Medicines Update | - | Payload |
| **`GET`** | `/api/pharmacy/prescription-scans` | Pharmacy Prescription Scans List | - | - |
| **`GET`** | `/api/pharmacy/prescriptions` | Pharmacy Prescriptions List | `status` | - |
| **`GET`** | `/api/pharmacy/purchase-orders` | Pharmacy Purchase Orders List | `status` | - |
| **`POST`** | `/api/pharmacy/purchase-orders` | Pharmacy Purchase Orders Create | - | Payload |
| **`DELETE`** | `/api/pharmacy/purchase-orders/{purchase_id}` | Pharmacy Purchase Orders Delete | - | - |
| **`PUT`** | `/api/pharmacy/purchase-orders/{purchase_id}` | Pharmacy Purchase Orders Update | - | Payload |
| **`GET`** | `/api/pharmacy/purchase-requests` | Pharmacy Purchase Requests List | `status` | - |
| **`POST`** | `/api/pharmacy/purchase-requests` | Pharmacy Purchase Requests Create | - | Payload |
| **`POST`** | `/api/pharmacy/purchase-requests/{pr_id}/approve` | Pharmacy Purchase Requests Approve | - | Payload |
| **`POST`** | `/api/pharmacy/purchase-requests/{pr_id}/reject` | Pharmacy Purchase Requests Reject | - | Payload |
| **`POST`** | `/api/pharmacy/purchase-requests/{pr_id}/status` | Pharmacy Purchase Requests Update Status | - | Payload |
| **`GET`** | `/api/pharmacy/returns` | Pharmacy Returns List | `status`, `admission_id`, `patient_id` | - |
| **`POST`** | `/api/pharmacy/returns` | Pharmacy Returns Create | - | Payload |
| **`POST`** | `/api/pharmacy/returns/{return_id}/reject` | Pharmacy Returns Reject | - | Payload |
| **`POST`** | `/api/pharmacy/returns/{return_id}/release` | Pharmacy Returns Release | - | - |
| **`GET`** | `/api/pharmacy/sales` | Pharmacy Sales List | `medicine_name`, `patient_id`, `invoice_id`, `admission_id`, `billing_type`, `sale_type`, `due_only`, `from_date`, `to_date`, `q` | - |
| **`GET`** | `/api/pharmacy/settings` | Pharmacy Settings Get | - | - |
| **`PUT`** | `/api/pharmacy/settings` | Pharmacy Settings Save | - | Payload |
| **`GET`** | `/api/pharmacy/stock` | Pharmacy Stock List | `stock_source` | - |
| **`POST`** | `/api/pharmacy/stock` | Pharmacy Stock Upsert | - | Payload |
| **`POST`** | `/api/pharmacy/stock/adjust` | Pharmacy Stock Adjust | - | Payload |
| **`GET`** | `/api/pharmacy/stock/adjustments` | Pharmacy Stock Adjustments List | - | - |
| **`GET`** | `/api/pharmacy/stock/ledger` | Pharmacy Stock Ledger | `stock_source`, `medicine_name` | - |
| **`POST`** | `/api/pharmacy/stock/{batch_id}/classify-source` | Pharmacy Stock Classify Source | - | Payload |
| **`DELETE`** | `/api/pharmacy/stock/{item_id}` | Pharmacy Stock Delete | - | - |
| **`GET`** | `/api/pharmacy/summary` | Pharmacy Summary | `date`, `target_date` | - |
| **`GET`** | `/api/pharmacy/suppliers` | Pharmacy Suppliers List | - | - |
| **`POST`** | `/api/pharmacy/suppliers` | Pharmacy Suppliers Create | - | Payload |
| **`DELETE`** | `/api/pharmacy/suppliers/{supplier_id}` | Pharmacy Suppliers Delete | - | - |
| **`PUT`** | `/api/pharmacy/suppliers/{supplier_id}` | Pharmacy Suppliers Update | - | Payload |
| **`GET`** | `/api/pharmacy/suppliers/{supplier_id}/ledger` | Pharmacy Supplier Ledger Get | - | - |
| **`POST`** | `/api/pharmacy/suppliers/{supplier_id}/payments` | Pharmacy Supplier Payment Create | - | Payload |
| **`PUT`** | `/api/pharmacy/ward-indent-items/{item_id}` | Pharmacy Ward Indent Item Update | - | Payload |
| **`POST`** | `/api/pharmacy/ward-indent-items/{item_id}/cancel` | Pharmacy Ward Indent Item Cancel | - | Payload |
| **`GET`** | `/api/pharmacy/ward-indents` | Pharmacy Ward Indents List | `status`, `ward`, `patient_id`, `admission_id` | - |
| **`POST`** | `/api/pharmacy/ward-indents` | Pharmacy Ward Indents Create | - | Payload |
| **`POST`** | `/api/pharmacy/ward-indents/{indent_id}/dispense` | Pharmacy Ward Indents Dispense | - | Payload |

---

## eMAR (Electronic Medication Administration)

_Nursing medication administration schedules, status updates, and dosage logs for admitted patients._

**Route Count:** 6

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/admissions/{admission_id}/running-pharmacy-charges` | Admission Running Pharmacy Charges | - | - |
| **`POST`** | `/api/emar/indent-items/{indent_item_id}/discontinue` | Emar Discontinue | - | Payload |
| **`POST`** | `/api/emar/{emar_id}/administer` | Emar Administer | - | Payload |
| **`POST`** | `/api/emar/{emar_id}/return` | Emar Return | - | Payload |
| **`POST`** | `/api/emar/{emar_id}/status` | Emar Set Status | - | Payload |
| **`GET`** | `/api/patients/{patient_id}/emar` | Patient Emar List | `admission_id`, `status` | - |

---

## Laboratory & Diagnostic Services

_Diagnostic order billing, sample collection, laboratory result recording, radiology/imaging attachments, doctor approvals, and test master catalogue._

**Route Count:** 68

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/admissions/{admission_id}/diag-running-charges` | Diag Running Charges | - | - |
| **`GET`** | `/api/diag/critical-alerts` | Diag Critical Alerts List | `open_only` | - |
| **`POST`** | `/api/diag/critical-alerts/{alert_id}/contact` | Diag Critical Alert Contact | - | Payload |
| **`POST`** | `/api/diag/critical-alerts/{alert_id}/escalate` | Diag Critical Alert Escalate | - | Payload |
| **`POST`** | `/api/diag/critical-alerts/{alert_id}/resolve` | Diag Critical Alert Resolve | - | - |
| **`GET`** | `/api/diag/equipment` | Diag Equipment List | `status` | - |
| **`POST`** | `/api/diag/equipment` | Diag Equipment Create | - | Payload |
| **`POST`** | `/api/diag/equipment/maintenance` | Diag Equipment Maintenance Create | - | Payload |
| **`PUT`** | `/api/diag/equipment/{equipment_id}` | Diag Equipment Update | - | Payload |
| **`GET`** | `/api/diag/equipment/{equipment_id}/maintenance` | Diag Equipment Maintenance List | - | - |
| **`POST`** | `/api/diag/equipment/{equipment_id}/return-to-service` | Diag Equipment Return To Service | - | - |
| **`POST`** | `/api/diag/imaging/exams/{exam_id}/cancel` | Diag Imaging Cancel | - | Payload |
| **`POST`** | `/api/diag/imaging/exams/{exam_id}/schedule` | Diag Imaging Schedule | - | Payload |
| **`POST`** | `/api/diag/imaging/exams/{exam_id}/status` | Diag Imaging Status Update | - | Payload |
| **`GET`** | `/api/diag/imaging/items/{item_id}` | Diag Imaging Item Detail | - | - |
| **`GET`** | `/api/diag/imaging/worklist` | Diag Imaging Worklist | `stage`, `modality`, `room`, `q`, `date_from`, `date_to` | - |
| **`GET`** | `/api/diag/invoices` | Diag Invoices List | `patient_id` | - |
| **`GET`** | `/api/diag/invoices/{invoice_id}` | Diag Invoice Detail | - | - |
| **`POST`** | `/api/diag/invoices/{invoice_id}/payments` | Diag Invoice Record Payment | - | Payload |
| **`POST`** | `/api/diag/items/{item_id}/report-draft` | Diag Report Draft Get Or Create | - | Payload |
| **`PUT`** | `/api/diag/lab/external-referral/{referral_id}` | Diag External Referral Update | - | Payload |
| **`GET`** | `/api/diag/lab/external-referrals` | Diag External Referrals List | `status` | - |
| **`GET`** | `/api/diag/lab/items/{item_id}` | Diag Lab Item Detail | - | - |
| **`POST`** | `/api/diag/lab/items/{item_id}/external-referral` | Diag External Referral Create | - | Payload |
| **`POST`** | `/api/diag/lab/items/{item_id}/results` | Diag Results Save | - | Payload |
| **`POST`** | `/api/diag/lab/specimens/{specimen_id}/collect` | Diag Specimen Collect | - | Payload |
| **`POST`** | `/api/diag/lab/specimens/{specimen_id}/receive` | Diag Specimen Receive | - | Payload |
| **`GET`** | `/api/diag/lab/worklist` | Diag Lab Worklist | `stage`, `q`, `priority` | - |
| **`POST`** | `/api/diag/order-items/{item_id}/cancel` | Diag Order Item Cancel | - | Payload |
| **`GET`** | `/api/diag/orders` | Diag Orders List | `patient_id`, `status`, `department_type`, `priority`, `encounter_type`, `admission_id` | - |
| **`POST`** | `/api/diag/orders` | Diag Orders Create | - | Payload |
| **`GET`** | `/api/diag/orders/check-duplicates` | Diag Orders Check Duplicates | `patient_id`, `service_id`, `admission_id`, `appointment_id` | - |
| **`GET`** | `/api/diag/orders/{order_id}` | Diag Order Detail | - | - |
| **`POST`** | `/api/diag/orders/{order_id}/confirm` | Diag Order Confirm | - | - |
| **`POST`** | `/api/diag/orders/{order_id}/items` | Diag Order Add Items | - | Payload |
| **`GET`** | `/api/diag/overview` | Diag Overview | - | - |
| **`GET`** | `/api/diag/packages` | Diag Packages List | `active_only` | - |
| **`POST`** | `/api/diag/packages` | Diag Packages Create | - | Payload |
| **`PUT`** | `/api/diag/packages/{package_id}` | Diag Packages Update | - | Payload |
| **`GET`** | `/api/diag/qc/holds` | Diag Qc Holds List | `status` | - |
| **`POST`** | `/api/diag/qc/holds/{hold_id}/corrective-action` | Diag Qc Hold Corrective Action | - | Payload |
| **`POST`** | `/api/diag/qc/holds/{hold_id}/release` | Diag Qc Hold Release | - | Payload |
| **`POST`** | `/api/diag/qc/holds/{hold_id}/repeat-qc` | Diag Qc Hold Repeat | - | Payload |
| **`GET`** | `/api/diag/qc/runs` | Diag Qc Runs List | `equipment_id`, `outcome` | - |
| **`POST`** | `/api/diag/qc/runs` | Diag Qc Run Create | - | Payload |
| **`POST`** | `/api/diag/qc/runs/{run_id}/review` | Diag Qc Run Review | - | Payload |
| **`GET`** | `/api/diag/quality/overview` | Diag Quality Overview | - | - |
| **`GET`** | `/api/diag/reagent-lots` | Diag Reagent Lots List | `status`, `expiring_within_days` | - |
| **`POST`** | `/api/diag/reagent-lots` | Diag Reagent Lot Create | - | Payload |
| **`POST`** | `/api/diag/reagent-lots/{lot_id}/status` | Diag Reagent Lot Status Update | - | Payload |
| **`GET`** | `/api/diag/report-templates` | Diag Report Templates List | `report_type` | - |
| **`POST`** | `/api/diag/report-templates` | Diag Report Templates Create | - | Payload |
| **`DELETE`** | `/api/diag/report-templates/{template_id}` | Diag Report Templates Deactivate | - | - |
| **`GET`** | `/api/diag/reports` | Diag Reports Worklist | `status`, `report_type`, `q`, `date_from`, `date_to` | - |
| **`GET`** | `/api/diag/reports/{report_id}` | Diag Report Detail | - | - |
| **`PUT`** | `/api/diag/reports/{report_id}` | Diag Report Save | - | Payload |
| **`POST`** | `/api/diag/reports/{report_id}/amend` | Diag Report Amend | - | Payload |
| **`POST`** | `/api/diag/reports/{report_id}/authorize` | Diag Report Authorize | - | Payload |
| **`POST`** | `/api/diag/reports/{report_id}/release` | Diag Report Release | - | - |
| **`POST`** | `/api/diag/reports/{report_id}/return` | Diag Report Return | - | Payload |
| **`POST`** | `/api/diag/reports/{report_id}/submit` | Diag Report Submit | - | - |
| **`GET`** | `/api/diag/services` | Diag Services List | `service_type`, `department`, `active_only`, `q` | - |
| **`POST`** | `/api/diag/services` | Diag Services Create | - | Payload |
| **`DELETE`** | `/api/diag/services/{service_id}` | Diag Services Deactivate | - | - |
| **`GET`** | `/api/diag/services/{service_id}` | Diag Service Detail | - | - |
| **`PUT`** | `/api/diag/services/{service_id}` | Diag Services Update | - | Payload |
| **`PUT`** | `/api/diag/services/{service_id}/parameters` | Diag Service Parameters Update | - | Payload |
| **`GET`** | `/api/lab/vendors-list` | Diag Lab Vendors For Referral | - | - |

---

## Ancillary Operations (OT, Legacy Lab, Finance & HR)

_Operation theatre schedules, legacy laboratory bills, company ledger entries, expense vouchers, and employee records._

**Route Count:** 53

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/accounts/doctors` | Accounts Doctor Payouts List | `doctor_name` | - |
| **`POST`** | `/api/accounts/doctors` | Accounts Doctor Payouts Create | - | Payload |
| **`DELETE`** | `/api/accounts/doctors/{payout_id}` | Accounts Doctor Payouts Delete | - | - |
| **`PUT`** | `/api/accounts/doctors/{payout_id}` | Accounts Doctor Payouts Update | - | Payload |
| **`GET`** | `/api/accounts/ledger` | Accounts Ledger List | `entry_type` | - |
| **`POST`** | `/api/accounts/ledger` | Accounts Ledger Create | - | Payload |
| **`DELETE`** | `/api/accounts/ledger/{entry_id}` | Accounts Ledger Delete | - | - |
| **`PUT`** | `/api/accounts/ledger/{entry_id}` | Accounts Ledger Update | - | Payload |
| **`GET`** | `/api/accounts/summary` | Accounts Summary | - | - |
| **`GET`** | `/api/accounts/vendors` | Accounts Vendor Payments List | `vendor_name` | - |
| **`POST`** | `/api/accounts/vendors` | Accounts Vendor Payments Create | - | Payload |
| **`DELETE`** | `/api/accounts/vendors/{payment_id}` | Accounts Vendor Payments Delete | - | - |
| **`PUT`** | `/api/accounts/vendors/{payment_id}` | Accounts Vendor Payments Update | - | Payload |
| **`GET`** | `/api/audit/logs` | Audit Logs List | `module`, `limit` | - |
| **`GET`** | `/api/hr/attendance` | Hr Attendance List | `employee_id` | - |
| **`POST`** | `/api/hr/attendance` | Hr Attendance Create | - | Payload |
| **`DELETE`** | `/api/hr/attendance/{attendance_id}` | Hr Attendance Delete | - | - |
| **`PUT`** | `/api/hr/attendance/{attendance_id}` | Hr Attendance Update | - | Payload |
| **`GET`** | `/api/hr/departments` | Hr Departments List | - | - |
| **`POST`** | `/api/hr/departments` | Hr Departments Create | - | Payload |
| **`DELETE`** | `/api/hr/departments/{department_id}` | Hr Departments Delete | - | - |
| **`PUT`** | `/api/hr/departments/{department_id}` | Hr Departments Update | - | Payload |
| **`GET`** | `/api/hr/leaves` | Hr Leaves List | `employee_id` | - |
| **`POST`** | `/api/hr/leaves` | Hr Leaves Create | - | Payload |
| **`DELETE`** | `/api/hr/leaves/{leave_id}` | Hr Leaves Delete | - | - |
| **`POST`** | `/api/hr/leaves/{leave_id}/status` | Hr Leave Status Update | - | Payload |
| **`GET`** | `/api/hr/payroll` | Hr Payroll List | `employee_id` | - |
| **`POST`** | `/api/hr/payroll` | Hr Payroll Create | - | Payload |
| **`DELETE`** | `/api/hr/payroll/{payroll_id}` | Hr Payroll Delete | - | - |
| **`PUT`** | `/api/hr/payroll/{payroll_id}` | Hr Payroll Update | - | Payload |
| **`DELETE`** | `/api/lab/categories` | Lab Categories Delete | - | Payload |
| **`GET`** | `/api/lab/categories` | Lab Categories List | `type` | - |
| **`POST`** | `/api/lab/categories` | Lab Categories Create | - | Payload |
| **`GET`** | `/api/lab/diagnostics` | Lab Diagnostics List | `patient_id`, `doctor_name` | - |
| **`POST`** | `/api/lab/diagnostics` | Lab Diagnostics Create | - | Payload |
| **`DELETE`** | `/api/lab/diagnostics/{diagnostic_id}` | Lab Diagnostics Delete | - | - |
| **`PUT`** | `/api/lab/diagnostics/{diagnostic_id}` | Lab Diagnostics Update | - | Payload |
| **`GET`** | `/api/lab/diagnostics/{diagnostic_id}/payments` | Lab Diagnostic Payments Get | - | - |
| **`POST`** | `/api/lab/diagnostics/{diagnostic_id}/payments` | Lab Diagnostic Payments Post | - | Payload |
| **`GET`** | `/api/lab/summary` | Lab Summary | - | - |
| **`GET`** | `/api/lab/vendors` | Lab Vendors List | - | - |
| **`POST`** | `/api/lab/vendors` | Lab Vendors Create | - | Payload |
| **`DELETE`** | `/api/lab/vendors/{vendor_id}` | Lab Vendors Delete | - | - |
| **`PUT`** | `/api/lab/vendors/{vendor_id}` | Lab Vendors Update | - | Payload |
| **`GET`** | `/api/ot/summary` | Ot Summary | - | - |
| **`GET`** | `/api/ot/surgeries` | Ot Surgeries List | `theatre_id`, `status` | - |
| **`POST`** | `/api/ot/surgeries` | Ot Surgeries Create | - | Payload |
| **`DELETE`** | `/api/ot/surgeries/{surgery_id}` | Ot Surgeries Delete | - | - |
| **`PUT`** | `/api/ot/surgeries/{surgery_id}` | Ot Surgeries Update | - | Payload |
| **`GET`** | `/api/ot/theatres` | Ot Theatres List | - | - |
| **`POST`** | `/api/ot/theatres` | Ot Theatres Create | - | Payload |
| **`DELETE`** | `/api/ot/theatres/{theatre_id}` | Ot Theatres Delete | - | - |
| **`PUT`** | `/api/ot/theatres/{theatre_id}` | Ot Theatres Update | - | Payload |

---

## Executive Analytics & Financial Reports

_Live revenue statistics, departmental collection summaries, daily close reconciliations, and printable PDF exports._

**Route Count:** 14

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/dashboard/export/csv` | Dashboard Export Csv | - | - |
| **`GET`** | `/api/dashboard/export/excel` | Dashboard Export Excel | - | - |
| **`GET`** | `/api/dashboard/export/pdf` | Dashboard Export Pdf | - | - |
| **`GET`** | `/api/dashboard/print/pdf` | Dashboard Print Pdf | - | - |
| **`GET`** | `/api/reports/export/csv` | Reports Export Csv | - | - |
| **`GET`** | `/api/reports/export/pdf` | Reports Export Pdf | - | - |
| **`POST`** | `/api/reports/export/pdf` | Standard Module Report Export Pdf | - | Payload |
| **`GET`** | `/api/reports/export/word` | Reports Export Word | - | - |
| **`GET`** | `/api/reports/live-summary` | Reports Live Summary | `period` | - |
| **`GET`** | `/api/reports/overview` | Reports Overview | - | - |
| **`GET`** | `/api/reports/patient-history` | Reports Patient History | `date`, `type`, `value` | - |
| **`GET`** | `/api/reports/revenue-summary` | Reports Revenue Summary | `date` | - |
| **`POST`** | `/api/share/upload` | Share Upload | - | JSON |
| **`GET`** | `/api/share/view/{share_token}` | Share View | - | - |

---

## System Configuration & Master Dropdowns

_Customizable dropdown lists, medical department configurations, and hospital master metadata._

**Route Count:** 4

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/config/dropdowns` | List Dropdowns | `category`, `active_only` | - |
| **`POST`** | `/api/config/dropdowns` | Create Dropdown | - | Payload |
| **`DELETE`** | `/api/config/dropdowns/{option_id}` | Delete Dropdown | - | - |
| **`PUT`** | `/api/config/dropdowns/{option_id}` | Update Dropdown | - | Payload |

---

## System & Infrastructure Endpoints

_Health probes, CORS preflight handlers, and frontend web asset routing._

**Route Count:** 3

| Method | Endpoint Path | Action / Summary | Query Parameters | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/` | Serve Frontend Index | - | - |
| **`OPTIONS`** | `/api/{full_path:path}` | Global CORS Preflight Options Handler | - | - |
| **`GET`** | `/{frontend_path}` | Serve Frontend Asset Or Route | - | - |

---
