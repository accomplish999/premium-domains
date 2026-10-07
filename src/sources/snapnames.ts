import { downloadIndexAdapter } from "./download-index";

export const snapnames = downloadIndexAdapter(
  "snapnames",
  "SnapNames",
  "https://www.snapnames.com/download.action?format=csv",
  "Same inventory platform as NameJet. The download page is the public list.",
  (domain) => `https://www.snapnames.com/store/basic.action?query=${encodeURIComponent(domain)}`,
);
