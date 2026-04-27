"use client";

import { Search, Crown } from "lucide-react";
import React from "react";
import { Input } from "../ui/input";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { useAuth } from "@/context/AuthContext";

const suggestions = [
  {
    id: "1",
    username: "narendramodi",
    displayName: "Narendra Modi",
    avatar:
      "https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?auto=compress&cs=tinysrgb&w=400",
    verified: true,
  },
  {
    id: "2",
    username: "akshaykumar",
    displayName: "Akshay Kumar",
    avatar:
      "https://images.pexels.com/photos/1382735/pexels-photo-1382735.jpeg?auto=compress&cs=tinysrgb&w=400",
    verified: true,
  },
  {
    id: "3",
    username: "rashtrapatibhvn",
    displayName: "President of India",
    avatar:
      "https://images.pexels.com/photos/1080213/pexels-photo-1080213.jpeg?auto=compress&cs=tinysrgb&w=400",
    verified: true,
  },
];

const PLAN_STYLES: Record<string, { label: string; gradient: string; text: string }> = {
  free: {
    label: "Free Plan",
    gradient: "from-gray-700 to-gray-600",
    text: "text-gray-300",
  },
  bronze: {
    label: "Bronze Plan",
    gradient: "from-amber-700 to-amber-600",
    text: "text-amber-200",
  },
  silver: {
    label: "Silver Plan",
    gradient: "from-slate-500 to-slate-400",
    text: "text-slate-100",
  },
  gold: {
    label: "Gold Plan",
    gradient: "from-yellow-600 to-yellow-400",
    text: "text-yellow-900",
  },
};

interface RightSidebarProps {
  onNavigate?: (page: string) => void;
}

export default function RightSidebar({ onNavigate }: RightSidebarProps) {
  const { user } = useAuth();
  const plan = user?.plan || "free";
  const planStyle = PLAN_STYLES[plan];

  return (
    <div className="w-80 p-4 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
        <Input
          placeholder="Search"
          className="pl-12 bg-gray-900 border-gray-800 text-white placeholder-gray-400 rounded-full py-3"
        />
      </div>

      {/* Premium Plan Card */}
      <Card
        className={`border-gray-800 overflow-hidden cursor-pointer transition-transform hover:scale-[1.01]`}
        onClick={() => onNavigate?.("subscription")}
      >
        <div className={`bg-gradient-to-r ${planStyle.gradient} p-4`}>
          <div className="flex items-center gap-2 mb-1">
            <Crown className={`h-5 w-5 ${planStyle.text}`} />
            <h3 className={`font-bold text-base ${planStyle.text}`}>
              {planStyle.label}
            </h3>
          </div>
          {plan === "free" ? (
            <p className="text-gray-300 text-sm">
              Upgrade for more tweets & premium features.
            </p>
          ) : (
            <p className={`text-sm ${planStyle.text} opacity-80`}>
              {plan === "gold"
                ? "Unlimited tweets · Active"
                : `${plan === "bronze" ? "3" : "5"} tweets/month · Active`}
            </p>
          )}
        </div>
        <CardContent className="p-3 bg-gray-900">
          <Button
            className={`w-full rounded-full font-semibold text-sm bg-gradient-to-r ${planStyle.gradient} ${planStyle.text} hover:opacity-90`}
          >
            {plan === "free" ? "Upgrade to Premium →" : "Manage Subscription →"}
          </Button>
        </CardContent>
      </Card>

      {/* Who to follow */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4">
          <h3 className="text-white text-xl font-bold mb-4">You might like</h3>
          <div className="space-y-4">
            {suggestions.map((user) => (
              <div key={user.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar} alt={user.displayName} />
                    <AvatarFallback>{user.displayName[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center space-x-1">
                      <span className="text-white font-semibold">{user.displayName}</span>
                      {user.verified && (
                        <div className="bg-blue-500 rounded-full p-0.5">
                          <svg className="h-3 w-3 text-white fill-current" viewBox="0 0 20 20">
                            <path d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <span className="text-gray-400 text-sm">@{user.username}</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="bg-white text-black hover:bg-gray-200 font-semibold rounded-full px-4"
                >
                  Follow
                </Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="text-blue-400 hover:text-blue-300 p-0 mt-4">
            Show more
          </Button>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="p-4 text-xs text-gray-500 space-y-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <a href="#" className="hover:underline">Terms of Service</a>
          <a href="#" className="hover:underline">Privacy Policy</a>
          <a href="#" className="hover:underline">Cookie Policy</a>
          <a href="#" className="hover:underline">Accessibility</a>
          <a href="#" className="hover:underline">Ads info</a>
        </div>
        <div>© 2024 X Corp.</div>
      </div>
    </div>
  );
}