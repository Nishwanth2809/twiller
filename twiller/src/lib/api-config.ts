export function apiBaseUrl(value: string | undefined, production: boolean): string {
  if(!value){if(production)throw new Error("NEXT_PUBLIC_BACKEND_URL is required for production");return "http://localhost:5000";}
  const parsed=new URL(value);
  if(!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash||production&&(parsed.protocol!=="https:"||["localhost","127.0.0.1"].includes(parsed.hostname)))throw new Error("Invalid public API URL");
  return value.replace(/\/$/,"");
}
