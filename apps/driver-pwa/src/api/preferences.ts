import { apiRequest } from "./client";

export type DriverLanguagePreference = {
  preferred_language: "en" | "es";
};

export function getDriverLanguagePreference() {
  return apiRequest<DriverLanguagePreference>("/api/v1/driver/preferences/language");
}

export function updateDriverLanguagePreference(preferredLanguage: "en" | "es") {
  return apiRequest<DriverLanguagePreference>("/api/v1/driver/preferences/language", {
    method: "PATCH",
    body: { preferred_language: preferredLanguage },
  });
}
