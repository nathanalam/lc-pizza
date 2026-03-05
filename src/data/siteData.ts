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
    address: "3431 Fort Meade Road",
    city: "Laurel",
    state: "MD",
    zip: "20724",
    phone: "(301) 555-0101",
    doordashUrl: "https://www.doordash.com/store/little-caesars-laurel-23180245",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "odenton",
    name: "Odenton",
    address: "1127 Annapolis Road",
    city: "Odenton",
    state: "MD",
    zip: "21113",
    phone: "(410) 555-0102",
    doordashUrl: "https://www.doordash.com/city/odenton-md/b/little-caesar's-41933/",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "patapsco",
    name: "Patapsco",
    address: "2131 W Patapsco Ave",
    city: "Baltimore",
    state: "MD",
    zip: "21230",
    phone: "(410) 555-0103",
    doordashUrl: "https://www.doordash.com/store/little-caesars-baltimore-1161154/",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "oxon-hill",
    name: "Oxon Hill",
    address: "24 Audrey Ln",
    city: "Oxon Hill",
    state: "MD",
    zip: "20745",
    phone: "(301) 555-0104",
    doordashUrl: "https://www.doordash.com/store/little-caesars-pizza-oxon-hill-828863/",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "baltimore",
    name: "Baltimore",
    address: "6313 York Road",
    city: "Baltimore",
    state: "MD",
    zip: "21212",
    phone: "(410) 555-0105",
    doordashUrl: "https://www.doordash.com/store/little-caesars-24344460/",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "randallstown",
    name: "Randallstown",
    address: "8716 Liberty Rd",
    city: "Randallstown",
    state: "MD",
    zip: "21133",
    phone: "(410) 496-4277",
    doordashUrl: "https://www.doordash.com/search/store/little-caesars/",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "essex",
    name: "Essex",
    address: "1225 Eastern Blvd",
    city: "Essex",
    state: "MD",
    zip: "21221",
    phone: "(443) 815-3817",
    doordashUrl: "https://www.doordash.com/search/store/little-caesars/",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "woodlawn",
    name: "Woodlawn",
    address: "6630 Security Blvd",
    city: "Woodlawn",
    state: "MD",
    zip: "21207",
    phone: "(443) 200-2206",
    doordashUrl: "https://www.doordash.com/search/store/little-caesars/",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "erdman",
    name: "Erdman",
    address: "3933 Erdman Ave",
    city: "Baltimore",
    state: "MD",
    zip: "21213",
    phone: "(410) 669-0418",
    doordashUrl: "https://www.doordash.com/store/little-caesars-baltimore-1161154/",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "richmond-forest-hill",
    name: "Forest Hill",
    address: "7340 Forest Hill Ave",
    city: "Richmond",
    state: "VA",
    zip: "23225",
    phone: "(804) 327-2406",
    doordashUrl: "https://www.doordash.com/search/store/little-caesars/",
    hours: "Mon-Sun: 11am - 10pm",
  },
  {
    id: "ashland",
    name: "Ashland",
    address: "217 S Washington Hwy",
    city: "Ashland",
    state: "VA",
    zip: "23005",
    phone: "(804) 752-2424",
    doordashUrl: "https://www.doordash.com/search/store/little-caesars/",
    hours: "Mon-Sun: 11am - 10pm",
  }
];
