// THE APP'S OWN FILE: hosts its pages load from, added to the Content-Security-Policy that
// scripts/csp.ts builds (the core's own hosts are already there). Read at build time by Node,
// so keep it plain data with no imports.
//
//   export const appCsp: AppCsp = { connect: ['https://maps.example.com'], img: ['https://tiles.example.com'] };

export interface AppCsp {
  script?: string[];
  connect?: string[];
  img?: string[];
  font?: string[];
  style?: string[];
  frame?: string[];
  media?: string[];
}

export const appCsp: AppCsp = {};
