
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
        xp: 50 + Math.floor(Math.random() * 20) 
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
            if (!t.completed) {
                onAwardXp(t.reward?.xp || 50);
            }
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-8 font-sans selection:bg-cyan-500/30">
      <div className="w-full max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Profile Card (Glassmorphism) */}
        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
            <div className="flex items-center gap-6 relative z-10">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-3xl font-bold text-white shadow-[0_0_30px_rgba(6,182,212,0.3)]">
                    {playerProfile.level}
                </div>
                <div className="flex-grow">
                    <div className="flex justify-between items-baseline mb-2">
                        <h2 className="text-2xl font-bold text-white tracking-tight">{playerProfile.rank}</h2>
                        <span className="text-xs font-medium text-cyan-400/80 tracking-widest uppercase">XP {playerProfile.currentXp} / {playerProfile.nextLevelXp}</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-cyan-400 shadow-[0_0_15px_#22d3ee] transition-all duration-700 ease-out"
                            style={{ width: `${xpPercentage}%` }}
                        />
                    </div>
                </div>
            </div>
            {/* Ambient Background Glow */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-1000"></div>
        </div>

        {/* Quest Hub */}
        <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-8 backdrop-blur-xl shadow-2xl">
            
            <div className="flex items-center justify-between mb-8">
                 <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                    Mission Log
                 </h1>
                 <div className="text-xs font-bold text-white/40 bg-white/5 px-4 py-1.5 rounded-full tracking-wider">
                    {completedCount} / {totalCount} READY
                 </div>
            </div>

            {/* Input Form */}
            <form onSubmit={addTask} className="mb-8">
                <div className="relative group">
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="New Objective..."
                        className="w-full bg-white/5 border-none rounded-2xl p-5 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all text-lg font-medium shadow-inner"
                    />
                    <button 
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="absolute right-4 top-4 p-1 text-white/30 hover:text-cyan-400 transition-colors"
                    >
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                </div>
                
                {isExpanded && (
                    <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
                        <textarea
                            value={inputDesc}
                            onChange={(e) => setInputDesc(e.target.value)}
                            placeholder="Add tactical details..."
                            rows={2}
                            className="w-full bg-white/5 border-none rounded-2xl p-4 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all resize-none shadow-inner"
                        />
                    </div>
                )}

                <div className="mt-4 flex justify-end">
                    <button 
                        type="submit"
                        disabled={!inputText.trim()}
                        className="bg-white text-slate-900 hover:bg-cyan-50 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg hover:scale-105 active:scale-95"
                    >
                        <Plus size={18} />
                        Add Task
                    </button>
                </div>
            </form>

            {/* Quest List */}
            <div className="space-y-3 mb-10">
                {tasks.length === 0 && (
                    <div className="text-center py-16 text-white/20 flex flex-col items-center border border-dashed border-white/10 rounded-3xl">
                        <Shield size={48} className="mb-4 opacity-50" strokeWidth={1} />
                        <p className="font-medium">No active directives</p>
                    </div>
                )}
                
                {tasks.map(task => (
                    <div 
                        key={task.id}
                        className={`group relative flex items-start gap-5 p-5 rounded-2xl border transition-all duration-300 ${
                            task.completed 
                            ? 'bg-slate-900/30 border-transparent opacity-50 scale-[0.99]' 
                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:scale-[1.01] hover:shadow-xl'
                        }`}
                    >
                        <button 
                            onClick={() => toggleTask(task.id)}
                            className={`flex-shrink-0 mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                                task.completed
                                ? 'bg-cyan-500 border-cyan-500 scale-110'
                                : 'border-white/20 hover:border-cyan-400 bg-transparent'
                            }`}
                        >
                            {task.completed && <Check size={14} className="text-white" strokeWidth={3} />}
                        </button>
                        
                        <div className="flex-grow min-w-0 pt-0.5">
                            <div className="flex justify-between items-start">
                                <h3 className={`font-semibold text-lg leading-tight ${task.completed ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                                    {task.text}
                                </h3>
                                <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${task.completed ? 'bg-white/5 text-slate-500' : 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20'}`}>
                                    <Star size={10} className="fill-current" />
                                    {task.reward?.xp || 50} XP
                                </div>
                            </div>
                            {task.description && (
                                <p className={`text-sm mt-1.5 leading-relaxed ${task.completed ? 'text-slate-600' : 'text-slate-400'}`}>
                                    {task.description}
                                </p>
                            )}
                        </div>

                        <button 
                            onClick={() => deleteTask(task.id)}
                            className="opacity-0 group-hover:opacity-100 absolute right-4 top-4 text-slate-500 hover:text-red-400 transition-all p-2 bg-slate-900/50 rounded-lg backdrop-blur"
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
                    w-full py-5 rounded-2xl font-bold text-lg tracking-widest uppercase transition-all duration-500
                    flex items-center justify-center gap-4 relative overflow-hidden group
                    ${isAllComplete 
                        ? 'bg-white text-slate-900 shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(255,255,255,0.5)]' 
                        : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'
                    }
                `}
            >
                {isLoading ? (
                    <span className="animate-pulse">Initializing...</span>
                ) : (
                    <>
                        <Rocket size={24} className={isAllComplete ? "group-hover:-translate-y-1 transition-transform" : ""} />
                        {isAllComplete ? "Deploy to Mission" : "Complete Tasks to Deploy"}
                    </>
                )}
            </button>

        </div>
      </div>
    </div>
  );
};

export default TodoList;
