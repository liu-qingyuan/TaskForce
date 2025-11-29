
import React, { useState, useEffect } from 'react';
import { Task, AppMode, PlayerProfile } from './types';
import TodoList from './components/TodoList';
import SpaceShooter from './components/SpaceShooter';
import { generateMissionBriefing } from './services/ai';
import { Rocket } from 'lucide-react';

const RANKS = [
  "Cadet",
  "Ensign",
  "Lieutenant",
  "Commander",
  "Captain",
  "Admiral",
  "Grand Admiral"
];

const getRank = (level: number) => RANKS[Math.min(level - 1, RANKS.length - 1)] || "Pilot";
const getNextLevelXp = (level: number) => level * 500;

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('todo');
  
  // Tasks State
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('tf_tasks');
    return saved ? JSON.parse(saved) : [];
  });

  // Profile State
  const [profile, setProfile] = useState<PlayerProfile>(() => {
    const saved = localStorage.getItem('tf_profile');
    if (saved) return JSON.parse(saved);
    return {
      level: 1,
      currentXp: 0,
      nextLevelXp: 500,
      rank: "Cadet"
    };
  });

  const [briefing, setBriefing] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    localStorage.setItem('tf_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('tf_profile', JSON.stringify(profile));
  }, [profile]);

  const awardXp = (amount: number) => {
    setProfile(prev => {
      let newXp = prev.currentXp + amount;
      let newLevel = prev.level;
      let nextXp = prev.nextLevelXp;

      // Level up logic
      while (newXp >= nextXp) {
        newXp -= nextXp;
        newLevel++;
        nextXp = getNextLevelXp(newLevel);
      }

      return {
        level: newLevel,
        currentXp: newXp,
        nextLevelXp: nextXp,
        rank: getRank(newLevel)
      };
    });
  };

  const handleStartGame = async () => {
    setIsGenerating(true);
    // Use the completed tasks context for the AI
    const completedTasks = tasks.filter(t => t.completed);
    
    // We start the transition animation
    setMode('briefing');
    
    const message = await generateMissionBriefing(completedTasks);
    setBriefing(message);
    
    setIsGenerating(false);
    
    // Short delay to read the transition screen properly before game starts
    setTimeout(() => {
        setMode('game');
    }, 2500);
  };

  const handleExitGame = () => {
    setMode('todo');
  };

  // Transition Screen
  if (mode === 'briefing') {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-50 p-6 text-center">
         <div className="relative mb-8">
            <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse"></div>
            <Rocket className="relative text-cyan-400 w-24 h-24 animate-bounce" />
         </div>
         <h2 className="text-3xl font-bold text-white mb-4 arcade-font tracking-widest animate-pulse">
            {isGenerating ? "ESTABLISHING UPLINK..." : "SYSTEMS GREEN"}
         </h2>
         <div className="max-w-md w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-cyan-500 animate-[loading_2s_ease-in-out_infinite]" style={{width: '100%'}}></div>
         </div>
         <p className="mt-4 text-slate-400 font-mono text-sm">Synchronizing task data with fleet command...</p>
         
         {!isGenerating && briefing && (
            <div className="mt-8 p-6 bg-slate-900/80 border border-cyan-500/30 rounded-lg max-w-lg backdrop-blur text-cyan-100 font-mono leading-relaxed shadow-lg animate-in slide-in-from-bottom-5 duration-500">
                <span className="text-cyan-500 font-bold block mb-2 text-xs tracking-widest uppercase">Incoming Transmission</span>
                {briefing}
            </div>
         )}
         
         <style>{`
            @keyframes loading {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
         `}</style>
      </div>
    );
  }

  if (mode === 'game') {
    return <SpaceShooter onExit={handleExitGame} missionBriefing={briefing} playerProfile={profile} />;
  }

  return (
    <TodoList 
      tasks={tasks} 
      setTasks={setTasks} 
      onStartGame={handleStartGame}
      isLoading={isGenerating}
      playerProfile={profile}
      onAwardXp={awardXp}
    />
  );
};

export default App;
