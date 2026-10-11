"use client";
import { useParams } from "next/navigation";
import Mainlayout from "@/components/layout/Mainlayout";
import CirclePage from "@/components/CirclePage";
export default function CircleRoute() { const { slug } = useParams<{ slug: string }>(); return <Mainlayout><CirclePage slug={slug} /></Mainlayout>; }
