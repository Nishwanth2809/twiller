"use client";
import { useParams } from "next/navigation";
import Mainlayout from "@/components/layout/Mainlayout";
import TopicPage from "@/components/TopicPage";
export default function TopicRoute() { const { slug } = useParams<{ slug: string }>(); return <Mainlayout><TopicPage slug={slug} /></Mainlayout>; }
