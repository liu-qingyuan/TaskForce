
import React, { useState } from 'react';
import { Task, PlayerProfile } from '../types';
import { Plus, Trash2, Check, Rocket, ListTodo, Shield, Star, ChevronDown, ChevronUp } from 'lucide-react';

interface TodoListProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onStartGame: () => void;
  isLoading: boolean;
  playerProfile: PlayerProfile;
  onAwardXp: (amount: number) => void;
}

const TodoList: React.FC<TodoListProps> = ({ tasks, setTasks, onStartGame, isLoading, playerProfile, onAwardXp }) => {
  const [inputText, setInputText] = useState('');
  const [inputDesc, setInputDesc] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    const newTask: Task = {
      id: Date.now().toString(),
      text: inputText.trim(),
      description: inputDesc.trim(),
      completed: false,
      createdAt: Date.now(),
      reward: {
        xp: 50 + Math.floor(Math.random() * 20) // Random XP between 50-70
      }
    };
    
    setTasks([...tasks, newTask]);
    setInputText('');
    setInputDesc('');
    setIsExpanded(false);
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => {
        if (t.id === id) {
            // If we are checking it (completing it)
            if (!t.completed) {
                onAwardXp(t.reward?.xp || 50);
            }
            // Note: We don't remove XP if unchecked, to prevent abuse/confusion, 
            // or we could implementing subtract logic. For now, simple "Quest Complete" feels best.
            // If user unchecks, they just have to do it again to launch, but don't lose the XP.
            return { ...t, completed: !t.completed };
        }
        return t;
    }));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;
  const isAllComplete = totalCount > 0 && completedCount === totalCount;
  const xpPercentage = (playerProfile.currentXp / playerProfile.nextLevelXp) * 100;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        
        {/* Profile Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center gap-4 relative z-10">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xl font-bold border-2 border-white/20 shadow-lg">
                    {playerProfile.level}
                </div>
                <div className="flex-grow">
                    <div className="flex justify-between items-baseline mb-1">
                        <h2 className="text-xl font-bold text-white uppercase tracking-wider">{playerProfile.rank}</h2>
                        <span className="text-xs font-mono text-cyan-400">XP: {playerProfile.currentXp} / {playerProfile.nextLevelXp}</span>
                    </div>
                    <div className="h-3 bg-slate-900/50 rounded-full overflow-hidden border border-slate-700">
                        <div 
                            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500 ease-out"
                            style={{ width: `${xpPercentage}%` }}
                        />
                    </div>
                </div>
            </div>
            {/* Ambient Background */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl transform translate-x-10 -translate-y-10"></div>
        </div>

        {/* Main Quest Hub */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm shadow-2xl">
            
            <div className="flex items-center justify-between mb-6">
                 <h1 className="text-2xl font-bold tracking-tight text-white arcade-font flex items-center gap-2">
                    <ListTodo className="text-cyan-400" /> 
                    Mission Log
                 </h1>
                 <div className="text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-700">
                    {completedCount}/{totalCount} OBJECTIVES
                 </div>
            </div>

            {/* Input Form */}
            <form onSubmit={addTask} className="mb-8 bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                <div className="relative">
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Enter Quest Title..."
                        className="w-full bg-transparent border-b border-slate-600 pb-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors text-lg"
                    />
                    <button 
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="absolute right-0 top-0 text-slate-500 hover:text-cyan-400 transition-colors"
                    >
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                </div>
                
                {isExpanded && (
                    <div className="mt-4 animate-in slide-in-from-top-2 duration-200">
                        <textarea
                            value={inputDesc}
                            onChange={(e) => setInputDesc(e.target.value)}
                            placeholder="Briefing details (optional)..."
                            rows={2}
                            className="w-full bg-slate-800/50 border border-slate-600 rounded-lg p-3 text-sm text-slate-300 focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                    </div>
                )}

                <div className="mt-4 flex justify-between items-center">
                    <span className="text-xs text-slate-500 font-mono">REWARD: ~50-70 XP</span>
                    <button 
                        type="submit"
                        disabled={!inputText.trim()}
                        className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all"
                    >
                        <Plus size={16} />
                        Add Quest
                    </button>
                </div>
            </form>

            {/* Quest List */}
            <div className="space-y-3 mb-8 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {tasks.length === 0 && (
                    <div className="text-center py-12 text-slate-500 flex flex-col items-center border-2 border-dashed border-slate-700 rounded-xl">
                        <Shield size={48} className="mb-4 opacity-20" />
                        <p>No active quests.</p>
                        <p className="text-sm opacity-50">Assign new objectives to begin.</p>
                    </div>
                )}
                
                {tasks.map(task => (
                    <div 
                        key={task.id}
                        className={`group relative overflow-hidden flex items-start gap-4 p-4 rounded-xl border transition-all duration-300 ${
                            task.completed 
                            ? 'bg-slate-900/40 border-slate-800 opacity-60' 
                            : 'bg-slate-800 border-slate-600 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                        }`}
                    >
                        <button 
                            onClick={() => toggleTask(task.id)}
                            className={`flex-shrink-0 mt-1 w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                                task.completed
                                ? 'bg-cyan-600 border-cyan-600'
                                : 'border-slate-500 hover:border-cyan-400 bg-slate-900'
                            }`}
                        >
                            {task.completed && <Check size={14} className="text-white" />}
                        </button>
                        
                        <div className="flex-grow min-w-0">
                            <div className="flex justify-between items-start">
                                <h3 className={`font-semibold text-lg truncate pr-2 ${task.completed ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                                    {task.text}
                                </h3>
                                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${task.completed ? 'bg-slate-700 text-slate-400' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                    <Star size={10} className="fill-current" />
                                    {task.reward?.xp || 50} XP
                                </div>
                            </div>
                            {task.description && (
                                <p className={`text-sm mt-1 ${task.completed ? 'text-slate-600' : 'text-slate-400'}`}>
                                    {task.description}
                                </p>
                            )}
                        </div>

                        <button 
                            onClick={() => deleteTask(task.id)}
                            className="opacity-0 group-hover:opacity-100 absolute right-2 bottom-2 text-slate-600 hover:text-red-400 transition-opacity p-2"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Launch Button */}
            <button
                onClick={onStartGame}
                disabled={!isAllComplete || isLoading}
                className={`
                    w-full py-4 rounded-xl font-bold uppercase tracking-wider transition-all duration-300
                    flex items-center justify-center gap-3 relative overflow-hidden
                    ${isAllComplete 
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25' 
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    }
                `}
            >
                {isLoading ? (
                    <span className="animate-pulse">Initializing Launch Sequence...</span>
                ) : (
                    <>
                        <Rocket size={24} className={isAllComplete ? "animate-bounce" : ""} />
                        {isAllComplete ? "Launch Interceptor" : "Complete All Quests to Launch"}
                    </>
                )}
            </button>

        </div>
      </div>
    </div>
  );
};

export default TodoList;
