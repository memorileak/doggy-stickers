import {Injectable} from '@angular/core';

@Injectable({providedIn: null})
export class RecentlyUsedStickersService {
  private readonly STORAGE_KEY = 'recently-used-stickers';
  private readonly MAX_SIZE = 100;

  private getStoredIds(): number[] {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  private saveIds(ids: number[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(ids));
  }

  pushStickerId(stickerId: number): void {
    const ids = this.getStoredIds();
    const filtered = ids.filter((id) => id !== stickerId);
    filtered.unshift(stickerId);
    const trimmed = filtered.slice(0, this.MAX_SIZE);
    this.saveIds(trimmed);
  }

  getRecentlyUsedStickerIds(size: number): number[] {
    const ids = this.getStoredIds();
    return ids.slice(0, size);
  }
}
