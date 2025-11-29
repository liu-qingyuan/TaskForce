import { GoogleGenAI } from "@google/genai";
import { Task } from "../types";

const apiKey = process.env.API_KEY || '';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey });

export const generateMissionBriefing = async (completedTasks: Task[]): Promise<string> => {
  if (!apiKey) {
    return "HQ Link Offline. Standard mission protocols in effect. Engage at will.";
  }

  const taskList = completedTasks.map(t => `- ${t.text}`).join('\n');
  const prompt = `
    The user has just completed the following real-world tasks to prepare for a "Metal Slug" style military operation:
    ${taskList}

    Write a very short (max 2 sentences), gritty, action-movie style "Mission Start" briefing. 
    Pretend the completed tasks were logistical preparations, intel gathering, or weapons maintenance for a ground assault.
    End with "Move out!" or "Lock and Load!"
    Do not use markdown formatting.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Gear secured. Zone is hot. Lock and Load!";
  } catch (error) {
    console.error("Failed to generate briefing:", error);
    return "Encrypted transmission received. Objectives clear. Move out!";
  }
};