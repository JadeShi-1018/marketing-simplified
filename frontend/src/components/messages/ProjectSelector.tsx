'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, FolderOpen, Check } from 'lucide-react';
import { ProjectAPI, type ProjectData } from '@/lib/api/projectApi';

interface ProjectSelectorProps {
  selectedProjectId: number | string | null;
  onSelectProject: (projectId: number | string) => void;
}

export default function ProjectSelector({
  selectedProjectId,
  onSelectProject,
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch user's projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        const projectList = await ProjectAPI.getProjects();
        setProjects(projectList);
        
        // Auto-select first project if none selected
        if (!selectedProjectId && projectList.length > 0) {
          // Check localStorage for last selected project
          const savedProjectId = localStorage.getItem('messages_selected_project');
          if (savedProjectId) {
            const matched = projectList.find(
              (p) =>
                String(p.id) === savedProjectId ||
                (p.slug !== undefined && p.slug === savedProjectId)
            );
            if (matched) {
              onSelectProject(matched.id);
            } else {
              onSelectProject(projectList[0].id);
            }
          } else {
            onSelectProject(projectList[0].id);
          }
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [selectedProjectId, onSelectProject]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isProjectSelected = (project: ProjectData) => {
    if (selectedProjectId === null) return false;
    return (
      project.id === selectedProjectId ||
      String(project.id) === String(selectedProjectId) ||
      (project.slug !== undefined && project.slug === selectedProjectId)
    );
  };

  const handleSelectProject = (projectId: number | string) => {
    onSelectProject(projectId);
    localStorage.setItem('messages_selected_project', String(projectId));
    setIsOpen(false);
  };

  const selectedProject = projects.find(isProjectSelected);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg animate-pulse">
        <div className="w-5 h-5 bg-gray-200 rounded" />
        <div className="w-32 h-4 bg-gray-200 rounded" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 text-yellow-700 rounded-lg">
        <FolderOpen className="w-5 h-5" />
        <span className="text-sm">No projects available</span>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors min-w-[200px] shadow-sm"
      >
        <FolderOpen className="w-5 h-5 text-[#3CCED7]" />
        <span className="flex-1 text-left text-sm font-medium text-gray-700 truncate">
          {selectedProject?.name || 'Select Project'}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="task-tab-scrollbar absolute top-full left-0 mt-1 w-full min-w-[250px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {projects.map((project) => {
            const isSelected = isProjectSelected(project);
            return (
              <button
                key={project.id}
                onClick={() => handleSelectProject(project.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${
                  isSelected ? 'bg-[#3CCED7]/10' : ''
                }`}
              >
                <FolderOpen
                  className={`w-4 h-4 flex-shrink-0 ${
                    isSelected ? 'text-[#3CCED7]' : 'text-gray-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${
                      isSelected ? 'text-[#3CCED7]' : 'text-gray-700'
                    }`}
                  >
                    {project.name}
                  </p>
                  {project.member_count && (
                    <p className="text-xs text-gray-500">
                      {project.member_count} member{project.member_count !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                {isSelected && (
                  <Check className="w-4 h-4 text-[#3CCED7] flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

