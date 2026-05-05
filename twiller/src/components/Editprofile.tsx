import { useAuth } from "@/context/AuthContext";
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Camera, LinkIcon, MapPin, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import LoadingSpinner from "./loading-spinner";
import axios from "axios";
import axiosInstance from "@/lib/axiosInstance";

const Editprofile = ({ isopen, onclose }: any) => {
  const { user, updateProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormdata] = useState({
    displayName: user?.displayName || "",
    bio: user?.bio || "",
    location: "Earth",
    website: "example.com",
    avatar: user?.avatar || "",
    notificationsEnabled: user?.notificationsEnabled || false,
  });
  const [error, setError] = useState<any>({});
  
  const [selectedLang, setSelectedLang] = useState("en");
  React.useEffect(() => {
    const match = document.cookie.match(/googtrans=\/en\/([a-zA-Z-]+)/);
    if (match) setSelectedLang(match[1]);
  }, []);
  const [showLangOtp, setShowLangOtp] = useState(false);
  const [langOtpInput, setLangOtpInput] = useState("");
  const [pendingLang, setPendingLang] = useState("");
  const [otpMethod, setOtpMethod] = useState("");

  if (!isopen || !user) return null;
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.displayName.trim()) {
      newErrors.displayName = "Display name is required";
    } else if (formData.displayName.length > 50) {
      newErrors.displayName = "Display name must be 50 characters or less";
    }

    if (formData.bio.length > 160) {
      newErrors.bio = "Bio must be 160 characters or less";
    }

    if (formData.website && formData.website.length > 100) {
      newErrors.website = "Website must be 100 characters or less";
    }

    if (formData.location && formData.location.length > 30) {
      newErrors.location = "Location must be 30 characters or less";
    }

    setError(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isLoading) return;

    setIsLoading(true);
    try {
      await updateProfile(formData);
      onclose();
    } catch (error) {
      setError({ general: "Failed to update profile. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormdata((prev) => ({ ...prev, [field]: value }));
    if (error[field]) {
      setError((prev: any) => ({ ...prev, [field]: "" }));
    }
  };

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
      if (url) {
        setFormdata((prev) => ({ ...prev, avatar: url }));
      }
    } catch (error) {
      console.log(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    if (lang === selectedLang) return;
    setPendingLang(lang);
    setIsLoading(true);
    try {
      const res = await axiosInstance.post("/request-language-change", { email: user?.email, targetLanguage: lang });
      setOtpMethod(res.data.method);
      setShowLangOtp(true);
    } catch (err: any) {
      setError({ general: err.response?.data?.error || "Failed to request language change" });
    } finally {
      setIsLoading(false);
    }
  };

  const verifyLanguageOtp = async () => {
    if (!langOtpInput) return;
    setIsLoading(true);
    try {
      await axiosInstance.post("/verify-language-change", { email: user?.email, otp: langOtpInput, targetLanguage: pendingLang });
      setSelectedLang(pendingLang);
      document.cookie = `googtrans=/en/${pendingLang}; path=/`;
      window.location.reload();
    } catch (err: any) {
      setError({ general: err.response?.data?.error || "Invalid OTP" });
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl bg-black border-gray-800 text-white max-h-[90vh] overflow-y-auto">
        <CardHeader className="relative pb-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                className="text-white bg-black hover:bg-gray-900"
                onClick={onclose}
                disabled={isLoading}
              >
                <X className="h-5 w-5" />
              </Button>
              <CardTitle className="text-xl font-bold">Edit profile</CardTitle>
            </div>
            <Button
              type="submit"
              form="edit-profile-form"
              className="bg-white text-black hover:bg-gray-200 font-semibold rounded-full px-6"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <LoadingSpinner size="sm" />
                  <span>Saving...</span>
                </div>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {error.general && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm m-4">
              {error.general}
            </div>
          )}

          <form id="edit-profile-form" onSubmit={handleSubmit}>
            {/* Cover Photo */}
            <div className="relative">
              <div className="h-48 bg-gradient-to-r from-blue-600 to-purple-600 relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-3 rounded-full bg-black/70 hover:bg-black/90"
                  disabled={isLoading}
                >
                  <Camera className="h-6 w-6 text-white" />
                </Button>
              </div>

              {/* Profile Picture */}
              <div className="absolute -bottom-16 left-4">
                <div className="relative">
                  <Avatar className="h-32 w-32 border-4 border-black">
                    <AvatarImage src={user?.avatar} alt={user?.displayName} />
                    <AvatarFallback className="text-2xl">
                      {user?.displayName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <input
                    type="file"
                    accept="image/*"
                    id="avatarUpload"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-3 rounded-full bg-black/70 hover:bg-black/90"
                    disabled={isLoading}
                    onClick={() =>
                      document.getElementById("avatarUpload")?.click()
                    }
                  >
                    <Camera className="h-5 w-5 text-white" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-4 mt-16 space-y-6">
              {/* Display Name */}
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-white">
                  Name
                </Label>
                <Input
                  id="displayName"
                  type="text"
                  value={formData.displayName}
                  onChange={(e) =>
                    handleInputChange("displayName", e.target.value)
                  }
                  className="bg-transparent border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
                  placeholder="Your display name"
                  maxLength={50}
                  disabled={isLoading}
                />
                <div className="flex justify-between text-sm">
                  {error.displayName && (
                    <p className="text-red-400">{error.displayName}</p>
                  )}
                  <p className="text-gray-400 ml-auto">
                    {formData.displayName.length}/50
                  </p>
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <Label htmlFor="bio" className="text-white">
                  Bio
                </Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleInputChange("bio", e.target.value)}
                  className="bg-transparent border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 resize-none min-h-[100px]"
                  placeholder="Tell the world about yourself"
                  maxLength={160}
                  disabled={isLoading}
                />
                <div className="flex justify-between text-sm">
                  {error.bio && <p className="text-red-400">{error.bio}</p>}
                  <p className="text-gray-400 ml-auto">
                    {formData.bio.length}/160
                  </p>
                </div>
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="location" className="text-white">
                  Location
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <Input
                    id="location"
                    type="text"
                    value={formData.location}
                    onChange={(e) =>
                      handleInputChange("location", e.target.value)
                    }
                    className="pl-10 bg-transparent border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
                    placeholder="Where are you located?"
                    maxLength={30}
                    disabled={isLoading}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  {error.location && (
                    <p className="text-red-400">{error.location}</p>
                  )}
                  <p className="text-gray-400 ml-auto">
                    {formData.location.length}/30
                  </p>
                </div>
              </div>

              {/* Website */}
              <div className="space-y-2">
                <Label htmlFor="website" className="text-white">
                  Website
                </Label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <Input
                    id="website"
                    type="text"
                    value={formData.website}
                    onChange={(e) =>
                      handleInputChange("website", e.target.value)
                    }
                    className="pl-10 bg-transparent border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
                    placeholder="Your website URL"
                    maxLength={100}
                    disabled={isLoading}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  {error.website && (
                    <p className="text-red-400">{error.website}</p>
                  )}
                  <p className="text-gray-400 ml-auto">
                    {formData.website.length}/100
                  </p>
                </div>
              </div>

              {/* Notifications Toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="space-y-0.5">
                  <Label className="text-white text-base">Keyword Notifications</Label>
                  <p className="text-gray-400 text-sm">
                    Get browser notifications when tweets contain "cricket" or "science"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!formData.notificationsEnabled && Notification.permission !== "granted") {
                      Notification.requestPermission();
                    }
                    handleInputChange("notificationsEnabled", !formData.notificationsEnabled);
                  }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    formData.notificationsEnabled ? "bg-blue-500" : "bg-gray-700"
                  }`}
                  role="switch"
                  aria-checked={formData.notificationsEnabled}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      formData.notificationsEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Language Selector */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="space-y-0.5">
                  <Label className="text-white text-base">Interface Language</Label>
                  <p className="text-gray-400 text-sm">Select your preferred language</p>
                </div>
                <select 
                  value={selectedLang} 
                  onChange={handleLanguageChange} 
                  className="bg-gray-900 border border-gray-700 text-white rounded p-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isLoading}
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="hi">Hindi</option>
                  <option value="pt">Portuguese</option>
                  <option value="zh-CN">Chinese</option>
                  <option value="fr">French</option>
                </select>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {showLangOtp && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="bg-gray-900 p-6 rounded-2xl w-full max-w-sm border border-gray-800 shadow-2xl">
            <h3 className="text-white text-lg font-bold mb-2">Verify Language Change</h3>
            <p className="text-gray-400 text-sm mb-4">
              {otpMethod === "email" 
                ? "An OTP was sent to your registered email address."
                : "An OTP was sent to your registered mobile number."}
            </p>
            <input 
              type="text" 
              placeholder="Enter 6-digit OTP" 
              value={langOtpInput} 
              onChange={e => setLangOtpInput(e.target.value)} 
              className="w-full bg-gray-950 border border-gray-700 text-white p-3 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
            />
            <div className="flex gap-3">
              <Button onClick={() => setShowLangOtp(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white" disabled={isLoading}>Cancel</Button>
              <Button onClick={verifyLanguageOtp} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white" disabled={isLoading}>
                {isLoading ? "Verifying..." : "Confirm"}
              </Button>
            </div>
            {error.general && <p className="text-red-400 text-sm mt-3 text-center">{error.general}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Editprofile;
