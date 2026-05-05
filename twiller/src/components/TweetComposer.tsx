import { useAuth } from "@/context/AuthContext";
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Image, Smile, Calendar, MapPin, BarChart3, Globe, Crown, Lock, Mic } from "lucide-react";
import { Separator } from "./ui/separator";
import axios from "axios";
import axiosInstance from "@/lib/axiosInstance";

const PLAN_LIMITS: Record<string, number> = {
  free: 1,
  bronze: 3,
  silver: 5,
  gold: Infinity,
};

const TweetComposer = ({ onTweetPosted, onNavigate }: any) => {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [imageurl, setimageurl] = useState("");
  const [planInfo, setPlanInfo] = useState<any>(null);
  const [limitError, setLimitError] = useState("");
  const [audioData, setAudioData] = useState("");
  const [audioDuration, setAudioDuration] = useState(0);
  const [showAudioOtpModal, setShowAudioOtpModal] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [audioOtp, setAudioOtp] = useState("");
  const maxLength = 200;

  useEffect(() => {
    if (user?.email) fetchPlanInfo();
  }, [user]);

  const fetchPlanInfo = async () => {
    try {
      const res = await axiosInstance.get(`/user-plan/${user!.email}`);
      setPlanInfo(res.data);
    } catch (err) {
      console.error("Failed to fetch plan info:", err);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!user || !content.trim()) return;
    setLimitError("");
    setIsLoading(true);
    try {
      const tweetdata = {
        author: user?._id,
        content,
        image: imageurl,
        audio: audioData,
        audioDuration,
        audioOtp,
      };
      const res = await axiosInstance.post("/post", tweetdata);
      onTweetPosted(res.data);
      setContent("");
      setimageurl("");
      setAudioData("");
      setAudioOtp("");
      setOtpInput("");
      // Refresh plan info after posting
      await fetchPlanInfo();
    } catch (error: any) {
      if (error.response?.data?.limitReached) {
        setLimitError(error.response.data.error);
      } else {
        setLimitError(error.response?.data?.error || "Failed to post tweet");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const characterCount = content.length;
  const isOverLimit = characterCount > maxLength;
  const isNearLimit = characterCount > maxLength * 0.8;
  if (!user) return null;

  const plan = user.plan || "free";
  const tweetCount = planInfo?.tweetCount ?? user.tweetCount ?? 0;
  const planLimit = planInfo?.planLimit === -1 ? Infinity : (planInfo?.planLimit ?? PLAN_LIMITS[plan] ?? 1);
  const isAtLimit = planLimit !== Infinity && tweetCount >= planLimit;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsLoading(true);
    const image = e.target.files[0];
    const formdataimg = new FormData();
    formdataimg.set("image", image);
    try {
      const res = await axios.post(
        "https://api.imgbb.com/1/upload?key=97f3fb960c3520d6a88d7e29679cf96f",
        formdataimg
      );
      const url = res.data.data.display_url;
      if (url) setimageurl(url);
    } catch (error) {
      console.log(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    if (file.size > 100 * 1024 * 1024) {
      setLimitError("Audio file size exceeds 100 MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const audioObj = new window.Audio(dataUrl);
      audioObj.onloadedmetadata = async () => {
        if (audioObj.duration > 300) {
          setLimitError("Audio duration exceeds 5 minutes limit.");
          return;
        }
        
        setIsLoading(true);
        try {
          await axiosInstance.post("/generate-audio-otp", { email: user?.email });
          setAudioData(dataUrl);
          setAudioDuration(audioObj.duration);
          setShowAudioOtpModal(true);
        } catch (error: any) {
          setLimitError(error.response?.data?.error || "Failed to send OTP for audio.");
        } finally {
          setIsLoading(false);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  return (
    <Card className="bg-black border-gray-800 border-x-0 border-t-0 rounded-none">
      <CardContent className="p-4">
        {/* Tweet limit indicator */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                plan === "gold"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : plan === "silver"
                  ? "bg-slate-500/20 text-slate-300"
                  : plan === "bronze"
                  ? "bg-amber-700/20 text-amber-400"
                  : "bg-gray-800 text-gray-400"
              }`}
            >
              <Crown className="h-3 w-3 inline mr-1" />
              {plan.charAt(0).toUpperCase() + plan.slice(1)}
            </span>
            <span className="text-xs text-gray-500">
              {planLimit === Infinity
                ? "Unlimited tweets"
                : `${tweetCount}/${planLimit} tweets used`}
            </span>
          </div>
          {isAtLimit && (
            <button
              onClick={() => onNavigate?.("subscription")}
              className="text-xs text-blue-400 hover:underline flex items-center gap-1"
            >
              <Crown className="h-3 w-3" /> Upgrade
            </button>
          )}
        </div>

        {/* Limit reached gate */}
        {isAtLimit ? (
          <div className="flex flex-col items-center py-6 px-4 text-center space-y-3 bg-gray-950 rounded-2xl border border-gray-800">
            <Lock className="h-8 w-8 text-gray-500" />
            <div>
              <p className="text-white font-semibold">Tweet limit reached</p>
              <p className="text-gray-400 text-sm mt-1">
                {plan === "free"
                  ? "Free plan allows 1 tweet/month."
                  : plan === "bronze"
                  ? "Bronze plan allows 3 tweets/month."
                  : "Silver plan allows 5 tweets/month."}
                {" "}Upgrade to post more.
              </p>
            </div>
            <Button
              onClick={() => onNavigate?.("subscription")}
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-full px-6 font-semibold"
            >
              <Crown className="h-4 w-4 mr-2" /> Upgrade Plan
            </Button>
          </div>
        ) : (
          <div className="flex space-x-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={user.avatar} alt={user.displayName || "User"} />
              <AvatarFallback>{user.displayName ? user.displayName[0] : user.username ? user.username[0] : "U"}</AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <form onSubmit={handleSubmit}>
                <Textarea
                  placeholder="What's happening?"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="bg-transparent border-none text-xl text-white placeholder-gray-500 resize-none min-h-[120px] focus-visible:ring-0 focus-visible:ring-offset-0"
                />

                {limitError && (
                  <p className="text-red-400 text-sm mt-1 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> {limitError}
                  </p>
                )}

                {audioData && (
                  <div className="mt-2 p-2 bg-gray-900 rounded-xl flex items-center justify-between border border-gray-800">
                    <audio controls src={audioData} className="h-10 w-full max-w-xs" />
                    <button type="button" onClick={() => { setAudioData(""); setAudioOtp(""); }} className="text-red-400 text-sm font-bold ml-4 hover:underline">Remove</button>
                  </div>
                )}

                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center space-x-4 text-blue-400">
                    <label
                      htmlFor="tweetImage"
                      className="p-2 rounded-full hover:bg-blue-900/20 cursor-pointer"
                    >
                      <Image className="h-5 w-5" />
                      <input
                        type="file"
                        accept="image/*"
                        id="tweetImage"
                        className="hidden"
                        onChange={handlePhotoUpload}
                        disabled={isLoading}
                      />
                    </label>
                    <label
                      htmlFor="tweetAudio"
                      className="p-2 rounded-full hover:bg-blue-900/20 cursor-pointer"
                    >
                      <Mic className="h-5 w-5" />
                      <input
                        type="file"
                        accept="audio/*"
                        id="tweetAudio"
                        className="hidden"
                        onChange={handleAudioUpload}
                        disabled={isLoading}
                      />
                    </label>
                    <Button variant="ghost" size="sm" className="p-2 rounded-full hover:bg-blue-900/20">
                      <BarChart3 className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="p-2 rounded-full hover:bg-blue-900/20">
                      <Smile className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="p-2 rounded-full hover:bg-blue-900/20">
                      <Calendar className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="p-2 rounded-full hover:bg-blue-900/20">
                      <MapPin className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Globe className="h-4 w-4 text-blue-400" />
                      <span className="text-sm text-blue-400 font-semibold">
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
                                className="text-gray-700"
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
                                    ? "text-red-500"
                                    : isNearLimit
                                    ? "text-yellow-500"
                                    : "text-blue-500"
                                }
                              />
                            </svg>
                          </div>
                          {isNearLimit && (
                            <span
                              className={`text-sm ${
                                isOverLimit ? "text-red-500" : "text-yellow-500"
                              }`}
                            >
                              {maxLength - characterCount}
                            </span>
                          )}
                        </div>
                      )}
                      <Separator orientation="vertical" className="h-6 bg-gray-700" />
                      <Button
                        type="submit"
                        disabled={!content.trim() || isOverLimit || isLoading}
                        className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-full px-6"
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

      {showAudioOtpModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 p-6 rounded-2xl w-full max-w-sm border border-gray-800 shadow-2xl">
            <h3 className="text-white text-lg font-bold mb-2">Verify Audio Upload</h3>
            <p className="text-gray-400 text-sm mb-4">An OTP was sent to your email to authorize this audio upload.</p>
            <input 
              type="text" 
              placeholder="Enter 6-digit OTP" 
              value={otpInput} 
              onChange={e => setOtpInput(e.target.value)} 
              className="w-full bg-gray-950 border border-gray-700 text-white p-3 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
            />
            <div className="flex gap-3">
              <Button onClick={() => { setShowAudioOtpModal(false); setAudioData(""); }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white">Cancel</Button>
              <Button onClick={() => { setAudioOtp(otpInput); setShowAudioOtpModal(false); }} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white">Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default TweetComposer;
