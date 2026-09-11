// Existing feature tests use English. Localization has its own catalog/store tests.
export const i18nMock = `
  export const t=(source,values={})=>(source??'').replace(/\\{(\\w+)\\}/g,(match,key)=>Object.hasOwn(values,key)?(values[key]==null||typeof values[key]==='boolean'?'':String(values[key])):match);
  export const localizedTextStyle=()=>undefined,appLocale=()=>undefined;
  export const appNumber=(value,options)=>new Intl.NumberFormat(undefined,options).format(value);
  export const useAppLanguage=()=>({t,localizedTextStyle,appLocale,appNumber,language:'en',preference:'device',ready:true});
`;
