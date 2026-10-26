/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_CLINIC_NAME?: string;
  readonly VITE_CLINIC_NAME_UPPER?: string;
  readonly VITE_CLINIC_TAGLINE?: string;
  readonly VITE_DOCTOR_NAME?: string;
  readonly VITE_DOCTOR_QUALIFICATIONS?: string;
  readonly VITE_DOCTOR_REG_NO?: string;
  readonly VITE_CLINIC_ADDRESS_LINE1?: string;
  readonly VITE_CLINIC_ADDRESS_LINE2?: string;
  readonly VITE_CLINIC_ADDRESS_LINE3?: string;
  readonly VITE_CLINIC_PHONE?: string;
  readonly VITE_CLINIC_EMAIL?: string;
  readonly VITE_DEFAULT_PHARMACY_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface RazorpayCheckoutInstance {
  open: () => void;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
}

interface RazorpayCheckoutConstructor {
  new (options: RazorpayCheckoutOptions): RazorpayCheckoutInstance;
}

interface Window {
  Razorpay?: RazorpayCheckoutConstructor;
}
