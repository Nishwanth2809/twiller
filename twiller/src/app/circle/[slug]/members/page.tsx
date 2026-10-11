"use client";
import { useParams } from "next/navigation";
import Mainlayout from "@/components/layout/Mainlayout";
import CircleMembersPage from "@/components/CircleMembersPage";
export default function CircleMembersRoute() { const { slug } = useParams<{ slug: string }>(); return <Mainlayout><CircleMembersPage slug={slug} /></Mainlayout>; }
