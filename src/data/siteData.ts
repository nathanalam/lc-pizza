// Location and site data - structured for easy future Google Sheets integration
// When ready, replace these with fetched data from Google Sheets API

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  doordashUrl: string;
  hours: string;
}

export interface PartnershipFormData {
  schoolName: string;
  contactName: string;
  email: string;
  phone: string;
  message: string;
}

// This function can be replaced with a Google Sheets fetch
export async function getLocations(): Promise<Location[]> {
  // TODO: Replace with Google Sheets API call
  // e.g., const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Locations?key=${API_KEY}`);
  return LOCATIONS;
}

// This function can be replaced with a Google Sheets append
export async function submitPartnershipForm(data: PartnershipFormData): Promise<boolean> {
  // TODO: Replace with Google Sheets API append
  // e.g., await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Partnerships:append`, { method: 'POST', body: JSON.stringify({ values: [[...]] }) });
  console.log("Partnership form submitted:", data);
  return true;
}

export const LOCATIONS: Location[] = [
  {
    id: "laurel",
    name: "Laurel",
    address: "312 Main St",
    city: "Laurel",
    state: "MD",
    zip: "20707",
    phone: "(301) 555-0101",
    doordashUrl: "https://www.doordash.com/store/little-caesars-laurel",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "odenton",
    name: "Odenton",
    address: "1450 Annapolis Rd",
    city: "Odenton",
    state: "MD",
    zip: "21113",
    phone: "(410) 555-0102",
    doordashUrl: "https://www.doordash.com/store/little-caesars-odenton",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "patapsco",
    name: "Patapsco",
    address: "7200 Patapsco Ave",
    city: "Baltimore",
    state: "MD",
    zip: "21222",
    phone: "(410) 555-0103",
    doordashUrl: "https://www.doordash.com/store/little-caesars-patapsco",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "oxon-hill",
    name: "Oxon Hill",
    address: "6196 Oxon Hill Rd",
    city: "Oxon Hill",
    state: "MD",
    zip: "20745",
    phone: "(301) 555-0104",
    doordashUrl: "https://www.doordash.com/store/little-caesars-oxon-hill",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "baltimore",
    name: "Baltimore",
    address: "3500 E Northern Pkwy",
    city: "Baltimore",
    state: "MD",
    zip: "21206",
    phone: "(410) 555-0105",
    doordashUrl: "https://www.doordash.com/store/little-caesars-baltimore",
    hours: "Mon-Sun: 11am - 10pm",
  },
];
