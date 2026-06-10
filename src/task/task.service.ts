import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { MonitoringEventService } from '../monitoring/scheduler/monitoring-event.service';

export type TaskStatus = 'running' | 'completed' | 'failed';

export interface TaskState {
  id: string;
  status: TaskStatus;
  progress: number;
  total: number;
  message?: string;
}

@Injectable()
export class TaskService {
  private tasks = new Map<string, TaskState>();

  constructor(private readonly monitoringEventService: MonitoringEventService) {}

  /**
   * Start a new task and broadcast its initial state.
   */
  startTask(total: number, message?: string): string {
    const id = uuidv4();
    const state: TaskState = {
      id,
      status: 'running',
      progress: 0,
      total,
      message,
    };
    this.tasks.set(id, state);
    this.emit(state);
    return id;
  }

  /**
   * Update the progress of an existing task.
   */
  updateProgress(id: string, progress: number, message?: string) {
    const state = this.tasks.get(id);
    if (!state) return;
    
    state.progress = progress;
    if (message !== undefined) {
      state.message = message;
    }
    
    this.emit(state);
  }

  /**
   * Mark a task as completed.
   */
  completeTask(id: string, message?: string) {
    const state = this.tasks.get(id);
    if (!state) return;

    state.status = 'completed';
    state.progress = state.total;
    if (message !== undefined) {
      state.message = message;
    }

    this.emit(state);
    // Cleanup after some time if needed, or immediately
    setTimeout(() => this.tasks.delete(id), 60000); // 1 minute retention
  }

  /**
   * Mark a task as failed.
   */
  failTask(id: string, message?: string) {
    const state = this.tasks.get(id);
    if (!state) return;

    state.status = 'failed';
    if (message !== undefined) {
      state.message = message;
    }

    this.emit(state);
    setTimeout(() => this.tasks.delete(id), 60000); // 1 minute retention
  }

  private emit(state: TaskState) {
    this.monitoringEventService.emitTaskProgress(
      state.id,
      state.status,
      state.progress,
      state.total,
      state.message,
    );
  }
}
