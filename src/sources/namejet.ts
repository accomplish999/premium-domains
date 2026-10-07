import { downloadIndexAdapter } from "./download-index";

export const namejet = downloadIndexAdapter(
  "namejet",
  "NameJet",
  "https://www.namejet.com/download.action?format=csv",
  "Official auction-list download page. The index lists CSV files. Downloading them returned HTTP 403 from this network.",
  (domain) => `https://www.namejet.com/store/basic.action?query=${encodeURIComponent(domain)}`,
);
