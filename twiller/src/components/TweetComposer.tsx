import { useAuth } from "@/context/AuthContext";
import React, { useId, useRef, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Image, Smile, Calendar, MapPin, BarChart3, Globe, Crown, Lock, Mic } from "lucide-react";
import { Separator } from "./ui/separator";
import axiosInstance from "@/lib/axiosInstance";
import { mediaErrorMessage, uploadMedia } from "@/lib/media";
import AccessibleDialog from "./ui/AccessibleDialog";
import TopicSelector from "./TopicSelector";
import type { Topic } from "@/lib/topics";
import type { Circle } from "@/lib/circles";
import CircleSelector from "./CircleSelector";

const TweetComposer = ({ onTweetPosted, onNavigate }: any) => {
  const { user, refreshUser } = useAuth();
  const inputId = useId();
  const submitting = useRef(false);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [imageurl, setimageurl] = useState("");
  const [limitError, setLimitError] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUploadUrl, setAudioUploadUrl] = useState("");
  const [audioPreview, setAudioPreview] = useState("");
  const [audioDuration, setAudioDuration] = useState(0);
  const [showAudioOtpModal, setShowAudioOtpModal] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [audioOtp, setAudioOtp] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>([]);
  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const maxLength = 200;

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!user || !content.trim() || submitting.current || isLoading) return;
    setLimitError("");
    submitting.current = true;
    setIsLoading(true);
    try {
      const uploadedAudio = audioFile && !audioUploadUrl ? await uploadMedia(audioFile, "audio") : null;
      const verifiedAudioUrl = uploadedAudio?.url || audioUploadUrl;
      if (uploadedAudio?.url) setAudioUploadUrl(uploadedAudio.url);
      const tweetdata = {
        author: user?._id,
        content,
        image: imageurl,
        audio: verifiedAudioUrl,
        audioDuration: uploadedAudio?.duration || audioDuration,
        audioOtp,
        topicIds: selectedTopics.map(topic => topic._id),
        ...(selectedCircle ? { circleId: selectedCircle._id } : {}),
      };
      const res = await axiosInstance.post("/post", tweetdata);
      onTweetPosted(res.data);
      setContent("");
      try { localStorage.removeItem("twiller_draft_content"); } catch {}
      setSelectedTopics([]);
      setSelectedCircle(null);
      setimageurl("");
      if (audioPreview) URL.revokeObjectURL(audioPreview);
      setAudioFile(null);
      setAudioUploadUrl("");
      setAudioPreview("");
      setAudioOtp("");
      setOtpInput("");
      void refreshUser().catch(() => setLimitError("Post published. Usage details could not refresh yet."));
    } catch (error: any) {
      if (error.response?.data?.limitReached) {
        setLimitError(error.response.data.error);
      } else {
        setLimitError(error.response?.data?.error || "Failed to post tweet");
      }
    } finally {
      setIsLoading(false);
      submitting.current = false;
    }
  };

  const characterCount = content.length;
  const isOverLimit = characterCount > maxLength;
  const isNearLimit = characterCount > maxLength * 0.8;
  if (!user) return null;

  const plan = user.plan || "free";
  const tweetCount = user.tweetCount ?? 0;
  const planLimit = user.planLimit === -1 ? Infinity : (user.planLimit ?? 1);
  const isAtLimit = planLimit !== Infinity && tweetCount >= planLimit;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsLoading(true);
    const image = e.target.files[0];
    try {
      const uploaded = await uploadMedia(image, "image");
      setimageurl(uploaded.url);
    } catch (error: unknown) {
      setLimitError(mediaErrorMessage(error, "Image upload failed. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    if (file.size > 10 * 1024 * 1024) {
      setLimitError("Audio file size exceeds 10 MB limit.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    if (audioPreview) URL.revokeObjectURL(audioPreview);
    const audioObj = new window.Audio(previewUrl);
      audioObj.onloadedmetadata = async () => {
        if (audioObj.duration > 300) {
          setLimitError("Audio duration exceeds 5 minutes limit.");
          URL.revokeObjectURL(previewUrl);
          return;
        }
        
        setIsLoading(true);
        try {
          await axiosInstance.post("/generate-audio-otp", { email: user?.email });
          setAudioFile(file);
          setAudioPreview(previewUrl);
          setAudioDuration(audioObj.duration);
          setShowAudioOtpModal(true);
        } catch (error: unknown) {
          URL.revokeObjectURL(previewUrl);
          setLimitError(mediaErrorMessage(error, "Failed to send OTP for audio."));
        } finally {
          setIsLoading(false);
        }
      };
      audioObj.onerror = () => { URL.revokeObjectURL(previewUrl); setLimitError("Choose a supported audio file."); };
  };

  const cancelAudioOtp = () => {
    setShowAudioOtpModal(false);
    if (audioPreview) URL.revokeObjectURL(audioPreview);
    setAudioFile(null);
    setAudioUploadUrl("");
    setAudioPreview("");
  };

  return (
    <Card className="twiller-composer bg-surface border-border border-x-0 border-t-0 rounded-none">
      <CardContent className="p-4">
        {/* Tweet limit indicator */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                plan === "gold"
                  ? "bg-warning/20 text-warning"
                  : plan === "silver"
                  ? "bg-primary-soft text-primary"
                  : plan === "bronze"
                  ? "bg-warning/20 text-warning"
                  : "bg-surface-hover text-text-muted"
              }`}
            >
              <Crown className="h-3 w-3 inline mr-1" />
              {plan.charAt(0).toUpperCase() + plan.slice(1)}
            </span>
            <span className="text-xs text-text-muted">
              {planLimit === Infinity
                ? "Unlimited tweets"
                : `${tweetCount}/${planLimit} posts used`}
            </span>
          </div>
          {isAtLimit && (
            <button
              onClick={() => onNavigate?.("subscription")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Crown className="h-3 w-3" /> Upgrade
            </button>
          )}
        </div>

        {/* Limit reached gate */}
        {isAtLimit ? (
          <div className="flex flex-col items-center py-6 px-4 text-center space-y-3 bg-surface-hover rounded-2xl border border-border">
            <Lock className="h-8 w-8 text-text-muted" />
            <div>
              <p className="text-text font-semibold">Post limit reached</p>
              <p className="text-text-muted text-sm mt-1">
                {plan === "free"
                  ? "Free plan allows 1 post or reply per calendar month."
                  : plan === "bronze"
                  ? "Bronze plan allows 3 posts or replies per 30-day period."
                  : "Silver plan allows 5 posts or replies per 30-day period."}
                {" "}Upgrade to post more.
              </p>
            </div>
            <Button
              onClick={() => onNavigate?.("subscription")}
              className="bg-primary hover:bg-primary-hover text-on-primary rounded-full px-6 font-semibold"
            >
              <Crown className="h-4 w-4 mr-2" /> Upgrade Plan
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 space-x-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={user.avatar || undefined} alt="" />
              <AvatarFallback aria-hidden="true">{user.displayName ? user.displayName[0] : user.username ? user.username[0] : "U"}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <form onSubmit={handleSubmit} aria-busy={isLoading}>
                <label htmlFor={`${inputId}-content`} className="sr-only">Write a post</label>
                <Textarea
                  id={`${inputId}-content`}
                  aria-describedby={`${inputId}-counter`}
                  placeholder="What's on your mind?"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    try { localStorage.setItem("twiller_draft_content", e.target.value); } catch {}
                  }}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && content.trim() && !isOverLimit && !isLoading) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  className="bg-transparent border-none text-base text-text placeholder-text-muted resize-none min-h-[76px] focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <span id={`${inputId}-counter`} className="sr-only">{characterCount} of {maxLength} characters used.</span>
                <TopicSelector selected={selectedTopics} onChange={setSelectedTopics} disabled={isLoading} />
                <CircleSelector selected={selectedCircle} onChange={setSelectedCircle} disabled={isLoading} />

                {limitError && (
                  <p role="alert" className="text-error text-sm mt-1 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> {limitError}
                  </p>
                )}

                {audioFile && (
                  <div className="mt-2 p-2 bg-surface-hover rounded-xl flex items-center justify-between border border-border">
                    <audio controls src={audioPreview} className="h-10 w-full max-w-xs" />
                    <button type="button" onClick={() => { URL.revokeObjectURL(audioPreview); setAudioFile(null); setAudioUploadUrl(""); setAudioPreview(""); setAudioOtp(""); }} className="text-error text-sm font-bold ml-4 hover:underline">Remove</button>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 text-primary sm:gap-4">
                    <label
                      htmlFor={`${inputId}-image`}
                      className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-primary-soft/50 focus-within:outline focus-within:outline-2 focus-within:outline-primary cursor-pointer transition-colors"
                    >
                      <Image aria-hidden="true" className="h-5 w-5" />
                      <span className="sr-only">Add an image</span>
                      <input
                        aria-label="Add an image to your post"
                        type="file"
                        accept="image/*"
                        id={`${inputId}-image`}
                        className="sr-only"
                        onChange={handlePhotoUpload}
                        disabled={isLoading}
                      />
                    </label>
                    <label
                      htmlFor={`${inputId}-audio`}
                      className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-primary-soft/50 focus-within:outline focus-within:outline-2 focus-within:outline-primary cursor-pointer transition-colors"
                    >
                      <Mic aria-hidden="true" className="h-5 w-5" />
                      <span className="sr-only">Add audio</span>
                      <input
                        aria-label="Add audio to your post"
                        type="file"
                        accept="audio/*"
                        id={`${inputId}-audio`}
                        className="sr-only"
                        onChange={handleAudioUpload}
                        disabled={isLoading}
                      />
                    </label>
                    <Button type="button" disabled aria-label="Polls (unavailable)" title="Not available" variant="ghost" size="sm" className="h-11 w-11 rounded-full p-2 opacity-50">
                      <BarChart3 aria-hidden="true" className="h-5 w-5" />
                    </Button>
                    <Button type="button" disabled aria-label="Emoji picker (unavailable)" title="Not available" variant="ghost" size="sm" className="h-11 w-11 rounded-full p-2 opacity-50">
                      <Smile aria-hidden="true" className="h-5 w-5" />
                    </Button>
                    <Button type="button" disabled aria-label="Schedule a post (unavailable)" title="Not available" variant="ghost" size="sm" className="h-11 w-11 rounded-full p-2 opacity-50">
                      <Calendar aria-hidden="true" className="h-5 w-5" />
                    </Button>
                    <Button type="button" disabled aria-label="Add a location (unavailable)" title="Not available" variant="ghost" size="sm" className="h-11 w-11 rounded-full p-2 opacity-50">
                      <MapPin aria-hidden="true" className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <span className="text-sm text-primary font-semibold">
                        Everyone can reply
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      {characterCount > 0 && (
                        <div className="flex items-center space-x-2">
                          <div className="relative w-8 h-8">
                            <svg className="w-8 h-8 transform -rotate-90">
                              <circle
                                cx="16"
                                cy="16"
                                r="14"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                                className="text-border"
                              />
                              <circle
                                cx="16"
                                cy="16"
                                r="14"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                                strokeDasharray={`${2 * Math.PI * 14}`}
                                strokeDashoffset={`${
                                  2 * Math.PI * 14 * (1 - characterCount / maxLength)
                                }`}
                                className={
                                  isOverLimit
                                    ? "text-error"
                                    : isNearLimit
                                    ? "text-warning"
                                    : "text-primary"
                                }
                              />
                            </svg>
                          </div>
                          {isNearLimit && (
                            <span
                              className={`text-sm font-semibold ${
                                isOverLimit ? "text-error" : "text-warning"
                              }`}
                            >
                              {maxLength - characterCount}
                            </span>
                          )}
                        </div>
                      )}
                      <Separator orientation="vertical" className="h-6 bg-border" />
                      <Button
                        type="submit"
                        disabled={!content.trim() || isOverLimit || isLoading}
                        loading={isLoading}
                        className="bg-primary hover:bg-primary-hover active:scale-95 text-on-primary font-semibold rounded-full px-6 transition-all shadow-sm"
                      >
                        Post
                      </Button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </CardContent>

      <AccessibleDialog open={showAudioOtpModal} onClose={cancelAudioOtp} labelledBy="audio-otp-title" describedBy="audio-otp-help">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-text shadow-2xl">
            <h2 id="audio-otp-title" className="mb-2 text-lg font-bold">Verify Audio Upload</h2>
            <p id="audio-otp-help" className="mb-4 text-sm text-text-muted">An OTP was sent to your email to authorize this audio upload.</p>
            <label htmlFor="audio-upload-otp" className="sr-only">Enter the six-digit audio upload code</label>
            <input
              id="audio-upload-otp"
              type="text" 
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={6}
              aria-describedby="audio-otp-help"
              placeholder="Enter 6-digit OTP" 
              value={otpInput} 
              onChange={e => setOtpInput(e.target.value)} 
              className="w-full bg-surface-hover border border-border text-text p-3 rounded-lg mb-4 focus:ring-2 focus:ring-primary focus:outline-none placeholder-text-muted" 
            />
            <div className="flex gap-3">
              <Button type="button" onClick={cancelAudioOtp} className="min-h-11 flex-1 border border-border bg-surface-hover hover:bg-surface text-text">Cancel</Button>
              <Button type="button" onClick={() => { setAudioOtp(otpInput); setShowAudioOtpModal(false); }} className="min-h-11 flex-1 bg-primary hover:bg-primary-hover text-on-primary">Confirm</Button>
            </div>
          </div>
      </AccessibleDialog>
    </Card>
  );
};

export default TweetComposer;
