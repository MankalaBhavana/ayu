/**
 * Clinic branding, contact, and doctor details configuration.
 * By default, uses safe defaults matching current clinic branding,
 * and allows overriding via environment variables (VITE_CLINIC_NAME, etc.)
 * for seamless white-label or production deployments.
 */
export const CLINIC_CONFIG = {
  name: (import.meta.env.VITE_CLINIC_NAME as string | undefined) || "Ayu Polyclinic & Emergency Clinic",
  nameUpper: ((import.meta.env.VITE_CLINIC_NAME_UPPER as string | undefined) ||
    (import.meta.env.VITE_CLINIC_NAME as string | undefined)?.toUpperCase() ||
    "AYU POLYCLINIC & EMERGENCY CLINIC"),
  tagline: (import.meta.env.VITE_CLINIC_TAGLINE as string | undefined) || "POLYCLINIC & DIAGNOSTICS",
  doctorName: (import.meta.env.VITE_DOCTOR_NAME as string | undefined) || "Dr. Sushanth. B",
  doctorQualifications: (import.meta.env.VITE_DOCTOR_QUALIFICATIONS as string | undefined) || "MBBS (Gandhi), (FCCM)",
  doctorRegNo: (import.meta.env.VITE_DOCTOR_REG_NO as string | undefined) || "TSMC/FM/27444",
  addressLine1: (import.meta.env.VITE_CLINIC_ADDRESS_LINE1 as string | undefined) || "GGF2+2F8, Old Alwal Road, Jonnabanda,",
  addressLine2: (import.meta.env.VITE_CLINIC_ADDRESS_LINE2 as string | undefined) || "Chetana Housing Colony, Brundavan Colony,",
  addressLine3: (import.meta.env.VITE_CLINIC_ADDRESS_LINE3 as string | undefined) || "Bollaram - 500010, Hyderabad.",
  phone: (import.meta.env.VITE_CLINIC_PHONE as string | undefined) || "+91 6303346810",
  email: (import.meta.env.VITE_CLINIC_EMAIL as string | undefined) || "dr.sushanth108@gmail.com",
  defaultPharmacyName: (import.meta.env.VITE_DEFAULT_PHARMACY_NAME as string | undefined) || "AYU POLYCLINIC & EMERGENCY CLINIC",
};
