/**
 * Static court hierarchy data for cascading dropdowns.
 * Source: eCourts + openjustice-in/ecourts courts.csv
 */

export interface CourtOption {
  value: string;
  label: string;
  stateCode?: string;
}

// High Courts with state codes
export const HIGH_COURTS: CourtOption[] = [
  { value: "2", label: "High Court of Andhra Pradesh", stateCode: "AP" },
  { value: "29", label: "High Court of Telangana", stateCode: "TG" },
  { value: "1", label: "Bombay High Court", stateCode: "MH" },
  { value: "16", label: "Calcutta High Court", stateCode: "WB" },
  { value: "8", label: "Delhi High Court", stateCode: "DL" },
  { value: "17", label: "Gujarat High Court", stateCode: "GJ" },
  { value: "6", label: "Gauhati High Court", stateCode: "AS" },
  { value: "5", label: "Himachal Pradesh High Court", stateCode: "HP" },
  { value: "12", label: "J&K High Court", stateCode: "JK" },
  { value: "7", label: "Jharkhand High Court", stateCode: "JH" },
  { value: "3", label: "Karnataka High Court", stateCode: "KA" },
  { value: "4", label: "Kerala High Court", stateCode: "KL" },
  { value: "14", label: "Madhya Pradesh High Court", stateCode: "MP" },
  { value: "10", label: "Madras High Court", stateCode: "TN" },
  { value: "25", label: "Manipur High Court", stateCode: "MN" },
  { value: "21", label: "Meghalaya High Court", stateCode: "ML" },
  { value: "11", label: "Orissa High Court", stateCode: "OD" },
  { value: "19", label: "Patna High Court", stateCode: "BR" },
  { value: "20", label: "Punjab & Haryana High Court", stateCode: "PB" },
  { value: "9", label: "Rajasthan High Court", stateCode: "RJ" },
  { value: "24", label: "Sikkim High Court", stateCode: "SK" },
  { value: "20", label: "Tripura High Court", stateCode: "TR" },
  { value: "13", label: "Allahabad High Court", stateCode: "UP" },
  { value: "15", label: "Uttarakhand High Court", stateCode: "UK" },
  { value: "18", label: "Chhattisgarh High Court", stateCode: "CT" },
];

// AP Districts
export const AP_DISTRICTS: CourtOption[] = [
  { value: "1", label: "Ananthapur" },
  { value: "2", label: "Chittoor" },
  { value: "3", label: "East Godavari" },
  { value: "4", label: "Guntur" },
  { value: "5", label: "Kadapa" },
  { value: "6", label: "Krishna" },
  { value: "7", label: "Kurnool" },
  { value: "8", label: "Nellore" },
  { value: "9", label: "Prakasam" },
  { value: "10", label: "Srikakulam" },
  { value: "11", label: "Visakhapatnam" },
  { value: "12", label: "Vizianagaram" },
  { value: "13", label: "West Godavari" },
  { value: "14", label: "NTR (Vijayawada)" },
  { value: "15", label: "Bapatla" },
  { value: "16", label: "Eluru" },
  { value: "17", label: "Palnadu" },
  { value: "18", label: "Konaseema" },
  { value: "19", label: "Kakinada" },
  { value: "20", label: "Anakapalli" },
  { value: "21", label: "Alluri Sitharama Raju" },
  { value: "22", label: "Sri Sathya Sai" },
  { value: "23", label: "Annamayya" },
  { value: "24", label: "Tirupati" },
  { value: "25", label: "Sri Potti Sriramulu Nellore" },
  { value: "26", label: "Parvathipuram Manyam" },
];

// Telangana Districts
export const TG_DISTRICTS: CourtOption[] = [
  { value: "1", label: "Hyderabad" },
  { value: "2", label: "Rangareddy" },
  { value: "3", label: "Medchal Malkajgiri" },
  { value: "4", label: "Sangareddy" },
  { value: "5", label: "Medak" },
  { value: "6", label: "Nizamabad" },
  { value: "7", label: "Kamareddy" },
  { value: "8", label: "Adilabad" },
  { value: "9", label: "Karimnagar" },
  { value: "10", label: "Warangal" },
  { value: "11", label: "Khammam" },
  { value: "12", label: "Nalgonda" },
  { value: "13", label: "Mahabubnagar" },
  { value: "14", label: "Vikarabad" },
  { value: "15", label: "Wanaparthy" },
  { value: "16", label: "Nagarkurnool" },
  { value: "17", label: "Jogulamba Gadwal" },
  { value: "18", label: "Suryapet" },
  { value: "19", label: "Yadadri Bhuvanagiri" },
  { value: "20", label: "Siddipet" },
  { value: "21", label: "Jagtial" },
  { value: "22", label: "Peddapalli" },
  { value: "23", label: "Rajanna Sircilla" },
  { value: "24", label: "Mancherial" },
  { value: "25", label: "Nirmal" },
  { value: "26", label: "Kumuram Bheem Asifabad" },
  { value: "27", label: "Jangaon" },
  { value: "28", label: "Jayashankar Bhupalpally" },
  { value: "29", label: "Mulugu" },
  { value: "30", label: "Bhadradri Kothagudem" },
  { value: "31", label: "Mahabubabad" },
  { value: "32", label: "Warangal Rural" },
  { value: "33", label: "Narayanpet" },
];

// Get districts by state code
export function getDistricts(stateCode: string): CourtOption[] {
  switch (stateCode) {
    case "AP": return AP_DISTRICTS;
    case "TG": return TG_DISTRICTS;
    default: return [];
  }
}

// SC case types
export const SC_CASE_TYPES: CourtOption[] = [
  { value: "1", label: "SLP(C) - Special Leave Petition (Civil)" },
  { value: "2", label: "SLP(Crl) - Special Leave Petition (Criminal)" },
  { value: "3", label: "C.A. - Civil Appeal" },
  { value: "4", label: "Crl.A. - Criminal Appeal" },
  { value: "5", label: "W.P.(C) - Writ Petition (Civil)" },
  { value: "6", label: "W.P.(Crl.) - Writ Petition (Criminal)" },
  { value: "7", label: "T.P.(C) - Transfer Petition (Civil)" },
  { value: "8", label: "T.P.(Crl.) - Transfer Petition (Criminal)" },
  { value: "31", label: "Diary Number" },
];

// Court types for the main selector
export const COURT_HIERARCHY = [
  { value: "SC", label: "Supreme Court of India" },
  { value: "HC", label: "High Court" },
  { value: "DC", label: "District Court" },
  { value: "NCLT", label: "NCLT" },
  { value: "CF", label: "Consumer Forum" },
] as const;
