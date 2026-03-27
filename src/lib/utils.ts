import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const COURT_TYPES = [
  { value: "SC", label: "Supreme Court" },
  { value: "HC", label: "High Court" },
  { value: "DC", label: "District Court" },
  { value: "NCLT", label: "NCLT" },
  { value: "CF", label: "Consumer Forum" },
] as const;

export const COURT_TYPE_COLORS: Record<string, string> = {
  SC: "bg-red-900/30 text-red-400 border border-red-800/50",
  HC: "bg-amber-900/30 text-amber-400 border border-amber-800/50",
  DC: "bg-green-900/30 text-green-400 border border-green-800/50",
  NCLT: "bg-purple-900/30 text-purple-400 border border-purple-800/50",
  CF: "bg-blue-900/30 text-blue-400 border border-blue-800/50",
};

export const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-900/30 text-amber-400 border border-amber-800/50",
  Disposed: "bg-green-900/30 text-green-400 border border-green-800/50",
  Transferred: "bg-blue-900/30 text-blue-400 border border-blue-800/50",
  Unknown: "bg-gray-800/50 text-gray-500 border border-gray-700/50",
};

export const INDIAN_STATES = [
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CT", name: "Chhattisgarh" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JH", name: "Jharkhand" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" },
  { code: "ML", name: "Meghalaya" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OD", name: "Odisha" },
  { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TG", name: "Telangana" },
  { code: "TR", name: "Tripura" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "UK", name: "Uttarakhand" },
  { code: "WB", name: "West Bengal" },
  { code: "DL", name: "Delhi" },
  { code: "JK", name: "Jammu & Kashmir" },
  { code: "LA", name: "Ladakh" },
];
