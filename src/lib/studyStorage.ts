const cloudPreference = process.env.NEXT_PUBLIC_STUDY_CLOUD;

export const cloudStudyEnabled = cloudPreference === "true" ||
  (cloudPreference !== "false" && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "smart-translate-xdu");

export const GUEST_OWNER_ID = "guest";

export function usesCloudStudy(ownerId: string) {
  return cloudStudyEnabled && ownerId !== GUEST_OWNER_ID;
}

export function requireStudySaveAccount(ownerId: string) {
  if (cloudStudyEnabled && !usesCloudStudy(ownerId)) throw new Error("请登录后将学习记录保存到云端。");
}

export function studySaveError(error: unknown, ownerId: string) {
  if (cloudStudyEnabled && !usesCloudStudy(ownerId)) return "请登录后将学习记录保存到云端。";
  if (!usesCloudStudy(ownerId)) return "保存失败，请检查浏览器的存储空间后重试。";
  if (error instanceof Error && !("code" in error)) return error.message;
  return "云端保存失败，请检查网络后重试。";
}
