import axiosInstance from "./axiosInstance";
export interface MediaUpload { id: string; url: string; mime: string; bytes: number; duration?: number }
export function mediaErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === "string") return response.data.error;
  }
  return error instanceof Error ? error.message : fallback;
}
export async function uploadMedia(file: File, kind: "image" | "audio"): Promise<MediaUpload> {
  const maximum=(kind==="image"?5:10)*1024*1024;
  if(!file.size||file.size>maximum)throw new Error(`Choose a file up to ${kind==="image"?5:10} MB`);
  const response=await axiosInstance.post<MediaUpload>("/media-upload",file,{
    params:{kind},headers:{"Content-Type":"application/octet-stream"},timeout:60000,
  });
  return response.data;
}
