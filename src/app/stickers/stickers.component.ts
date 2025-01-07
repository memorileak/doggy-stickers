import {
  catchError,
  Observable,
  Subject,
  of,
  debounceTime,
  distinctUntilChanged,
  switchMap,
} from 'rxjs';
import {CommonModule} from '@angular/common';
import {Component, OnDestroy, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {
  StickerSet,
  Sticker,
  StickerSetsService,
  StickersService,
  RecentlyUsedStickersService,
} from '@modules/stickers';

@Component({
  selector: 'app-stickers',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './stickers.component.html',
})
export class StickersComponent implements OnInit, OnDestroy {
  private readonly LEFT_SIDEBAR_BREAKPOINT = 1024; // 1024px is lg breakpoint
  private notificationTimeout?: number;

  stickerSets$: Observable<StickerSet[]>;
  activeSetSubject$: Subject<StickerSet>;
  searchKeywordSubject$: Subject<string>;

  activeSetId = 0;
  searchKeyword = '';
  visibleStickers: Sticker[] = [];

  hasNotification = false;
  showNotification = false;

  isSidebarOpen = window.innerWidth >= this.LEFT_SIDEBAR_BREAKPOINT;

  constructor(
    readonly stickerSetsService: StickerSetsService,
    readonly stickersService: StickersService,
    readonly recentlyUsedStickersService: RecentlyUsedStickersService,
  ) {
    this.resizeHandler = this.resizeHandler.bind(this);
    this.searchStickers = this.searchStickers.bind(this);

    this.stickerSets$ = this.stickerSetsService.getAllStickerSets(true);
    this.activeSetSubject$ = new Subject<StickerSet>();
    this.searchKeywordSubject$ = new Subject<string>();
  }

  ngOnInit() {
    window.addEventListener('resize', this.resizeHandler);

    this.stickerSets$.subscribe((stickerSets) => {
      if (Array.isArray(stickerSets) && stickerSets?.length) {
        const activeSetId = this.activeSetId ?? 0;
        const nextActiveSet = stickerSets.find((s) => s.id === activeSetId) ?? stickerSets[0];
        this.activeSetSubject$.next(nextActiveSet);
      }
    });

    this.activeSetSubject$
      .pipe(
        switchMap((activeSet) => {
          this.activeSetId = activeSet?.id ?? 0;
          return of(activeSet);
        }),
      )
      .subscribe(this.searchStickers);
    this.searchKeywordSubject$
      .pipe(debounceTime(500), distinctUntilChanged())
      .subscribe(this.searchStickers);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
    if (this.notificationTimeout) {
      window.clearTimeout(this.notificationTimeout);
    }
    this.activeSetSubject$.complete();
    this.searchKeywordSubject$.complete();
  }

  private resizeHandler(): void {
    this.isSidebarOpen = window.innerWidth >= this.LEFT_SIDEBAR_BREAKPOINT;
  }

  selectSet(set: StickerSet) {
    this.activeSetSubject$.next(set);
  }

  async copyStickerToClipboard(sticker: Sticker): Promise<void> {
    try {
      const stickerUrl = this.stickersService.getStickerPublicUrl(sticker.image_path);
      const response = await fetch(stickerUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      this.recentlyUsedStickersService.pushStickerId(sticker.id);
      this.showNotificationMessage();
    } catch (error) {
      console.error('Failed to copy sticker:', error);
    }
  }

  private showNotificationMessage(): void {
    if (this.notificationTimeout) {
      window.clearTimeout(this.notificationTimeout);
    }
    this.hasNotification = true;
    window.setTimeout(() => {
      if (this.hasNotification && !this.showNotification) {
        this.showNotification = true;
      }
      this.notificationTimeout = window.setTimeout(() => {
        this.showNotification = false;
      }, 3000);
    }, 100);
  }

  removeNotificationElement(): void {
    if (!this.showNotification && this.hasNotification) {
      this.hasNotification = false;
    }
  }

  onSearch(keyword: string): void {
    this.searchKeyword = keyword;
    this.searchKeywordSubject$.next(this.searchKeyword);
  }

  searchStickers(): void {
    const stickerSetId = this.activeSetId ?? 0;
    const tagsString = this.searchKeyword ?? '';
    this.stickersService
      .searchStickersBySetIdAndTags(stickerSetId, tagsString)
      .pipe(
        catchError((err) => {
          console.error('Search failed:', err);
          return of([]);
        }),
      )
      .subscribe((stickers) => {
        if (!stickerSetId && !tagsString) {
          const recentIds = this.recentlyUsedStickersService.getRecentlyUsedStickerIds(32);
          const recentStickers: Sticker[] = [];
          const otherStickers: Sticker[] = [];
          for (const s of stickers) {
            const recentIndex = recentIds.indexOf(s.id);
            if (recentIndex !== -1) {
              recentStickers[recentIndex] = s;
            } else {
              otherStickers.push(s);
            }
          }
          this.visibleStickers = recentStickers.filter((s) => !!s).concat(otherStickers);
        } else {
          this.visibleStickers = stickers;
        }
      });
  }
}
