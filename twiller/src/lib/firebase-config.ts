export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

// The existing live app keeps its current Firebase project. A Vercel staging
// build must supply every field explicitly so it cannot use the live project.
export function firebaseWebConfig(stage: string | undefined, values: Partial<FirebaseWebConfig>, live: FirebaseWebConfig, vercelEnvironment?: string): FirebaseWebConfig {
  if (vercelEnvironment === "preview" && stage !== "staging") throw new Error("Vercel Preview requires explicit staging Firebase configuration");
  if (stage && stage !== "staging") throw new Error("Unknown Twiller deployment stage");
  if (stage !== "staging") return live;
  const required = Object.entries(values).length === 6 && Object.values(values).every(value => typeof value === "string" && value.length > 0);
  if (!required || !values.projectId || values.projectId === live.projectId || values.projectId.startsWith("demo-")) {
    throw new Error("Staging requires a separate real Firebase Web app configuration");
  }
  if (values.authDomain !== `${values.projectId}.firebaseapp.com` && values.authDomain !== `${values.projectId}.web.app`) {
    throw new Error("Staging Firebase auth domain must belong to the staging project");
  }
  return values as FirebaseWebConfig;
}
