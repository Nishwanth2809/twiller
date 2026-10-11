import { useAuth } from "@/context/AuthContext";
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Camera, LinkIcon, MapPin, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import AccessibleDialog from "./ui/AccessibleDialog";
import LoadingSpinner from "./loading-spinner";
import { mediaErrorMessage, uploadMedia } from "@/lib/media";

const Editprofile = ({ isopen, onclose }: any) => {
  const { user, updateProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormdata] = useState({
    displayName: user?.displayName || "",
    bio: user?.bio || "",
    location: user?.location || "",
    website: user?.website || "",
    avatar: user?.avatar || "",
    notificationsEnabled: user?.notificationsEnabled || false,
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState<any>({});
  

  useEffect(() => {
    if (!isopen || !user) { setAvatarPreview(null); return; }
    setFormdata({ displayName: user.displayName || "", bio: user.bio || "", location: user.location || "", website: user.website || "", avatar: user.avatar || "", notificationsEnabled: Boolean(user.notificationsEnabled) });
    setAvatarPreview(null);
    setError({});
  }, [isopen, user]);
  useEffect(() => () => {
    if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

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

    if (formData.website && !/^https?:\/\//i.test(formData.website)) {
      newErrors.website = "Website must start with http:// or https://";
    } else if (formData.website && formData.website.length > 100) {
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
      const canonical = await updateProfile(formData);
      setFormdata({ displayName: canonical.displayName || "", bio: canonical.bio || "", location: canonical.location || "", website: canonical.website || "", avatar: canonical.avatar || "", notificationsEnabled: Boolean(canonical.notificationsEnabled) });
      setAvatarPreview(null);
      onclose();
    } catch {
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
    setAvatarPreview(URL.createObjectURL(image));
    try {
      const uploaded = await uploadMedia(image, "image");
      setFormdata((prev) => ({ ...prev, avatar: uploaded.url }));
    } catch (error: unknown) {
      setAvatarPreview(null);
      setError((prev: any) => ({ ...prev, general: mediaErrorMessage(error, "Image upload failed. Please try again.") }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AccessibleDialog open={isopen} onClose={onclose} labelledBy="edit-profile-title">
      <Card className="w-full max-w-2xl bg-black border-gray-800 text-white max-h-[90vh] overflow-y-auto">
        <CardHeader className="relative pb-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close edit profile"
                autoFocus
                className="text-white bg-black hover:bg-gray-900"
                onClick={() => { setAvatarPreview(null); onclose(); }}
                disabled={isLoading}
              >
                <X className="h-5 w-5" />
              </Button>
              <CardTitle id="edit-profile-title" className="text-xl font-bold">Edit profile</CardTitle>
            </div>
            <Button
              type="submit"
              form="edit-profile-form"
              aria-busy={isLoading}
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
            <div role="alert" className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm m-4">
              {error.general}
            </div>
          )}

          <form id="edit-profile-form" onSubmit={handleSubmit}>
            {/* Cover Photo */}
            <div className="relative">
              <div aria-hidden="true" className="h-48 bg-gradient-to-r from-indigo-600 to-violet-500 relative" />

              {/* Profile Picture */}
              <div className="absolute -bottom-16 left-4">
                <div className="relative">
                  <Avatar className="h-32 w-32 border-4 border-black">
                    <AvatarImage src={avatarPreview || formData.avatar || undefined} alt="" />
                    <AvatarFallback aria-hidden="true" className="text-2xl">
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
                    aria-label="Choose a profile photo"
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
                  required
                  aria-invalid={Boolean(error.displayName)}
                  aria-describedby={error.displayName ? "edit-display-name-error" : "edit-display-name-help"}
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
                    <p id="edit-display-name-error" aria-live="polite" className="text-red-400">{error.displayName}</p>
                  )}
                  <p id="edit-display-name-help" className="text-gray-400 ml-auto">
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
                  aria-invalid={Boolean(error.bio)}
                  aria-describedby={error.bio ? "edit-bio-error" : "edit-bio-help"}
                  value={formData.bio}
                  onChange={(e) => handleInputChange("bio", e.target.value)}
                  className="bg-transparent border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 resize-none min-h-[100px]"
                  placeholder="Tell the world about yourself"
                  maxLength={160}
                  disabled={isLoading}
                />
                <div className="flex justify-between text-sm">
                  {error.bio && <p id="edit-bio-error" aria-live="polite" className="text-red-400">{error.bio}</p>}
                  <p id="edit-bio-help" className="text-gray-400 ml-auto">
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
                    aria-invalid={Boolean(error.location)}
                    aria-describedby={error.location ? "edit-location-error" : "edit-location-help"}
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
                    <p id="edit-location-error" aria-live="polite" className="text-red-400">{error.location}</p>
                  )}
                  <p id="edit-location-help" className="text-gray-400 ml-auto">
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
                    aria-invalid={Boolean(error.website)}
                    aria-describedby={error.website ? "edit-website-error" : "edit-website-help"}
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
                    <p id="edit-website-error" aria-live="polite" className="text-red-400">{error.website}</p>
                  )}
                  <p id="edit-website-help" className="text-gray-400 ml-auto">
                    {formData.website.length}/100
                  </p>
                </div>
              </div>

              {/* Notifications currently exist only as in-app activity. */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="space-y-0.5">
                  <Label className="text-white text-base">Activity</Label>
                  <p className="text-gray-400 text-sm">
                    Likes, follows, replies, and mentions appear in the Activity page. Browser push and keyword alerts are not available.
                  </p>
                </div>
              </div>

              {/* Language Selector */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="space-y-0.5">
                  <Label className="text-white text-base">Interface Language</Label>
                  <p className="text-gray-400 text-sm">The interface is currently available in English only.</p>
                </div>
                <span className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-400">English</span>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

    </AccessibleDialog>
  );
};

export default Editprofile;
