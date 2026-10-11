"use client";
import React,{useState} from "react";
import axiosInstance from "@/lib/axiosInstance";
export default function CollectionMore<T>({endpoint,cursor,onLoaded}:{endpoint:string;cursor:string;onLoaded:(items:T[])=>void}) {
  const [next,setNext]=useState(cursor),[busy,setBusy]=useState(false),[error,setError]=useState("");
  if(!next)return null;
  const load=async()=>{
    setBusy(true);setError("");
    try {const response=await axiosInstance.get<T[]>(endpoint,{params:{cursor:next}});onLoaded(response.data);setNext(response.headers["x-next-cursor"]||"");}
    catch {setError("Could not load more. Please retry.");}finally{setBusy(false);}
  };
  return <div className="p-4 text-center"><button type="button" className="text-blue-400 disabled:opacity-50" disabled={busy} onClick={load}>{busy?"Loading…":"Load more"}</button>{error&&<p role="alert" className="text-red-400">{error}</p>}</div>;
}
