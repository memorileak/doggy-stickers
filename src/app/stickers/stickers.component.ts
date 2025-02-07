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
  PaginatedResponse,
} from '@modules/stickers';

type UINotification = {isError: boolean; content: string};

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
  currentPage = 1;
  pageSize = 20;
  totalPages = 1;
  visibleStickers: Sticker[] = [];

  notification: UINotification | null = null;
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
          if (this.activeSetId !== (activeSet?.id ?? 0)) {
            this.activeSetId = activeSet?.id ?? 0;
            this.currentPage = 1;
          }
          return of(activeSet);
        }),
      )
      .subscribe(this.searchStickers);
    this.searchKeywordSubject$
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap((searchKeyword) => {
          this.currentPage = 1;
          return of(searchKeyword);
        }),
      )
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
      this.showNotificationMessage({isError: false, content: 'Sticker copied to clipboard!'});
    } catch (error) {
      console.error('Failed to copy sticker:', error);
      this.showNotificationMessage({
        isError: true,
        content: 'Failed to copy sticker, please try copying image manually instead.',
      });
    }
  }

  private showNotificationMessage(notification: UINotification): void {
    if (this.notificationTimeout) {
      window.clearTimeout(this.notificationTimeout);
    }
    this.notification = notification;
    window.setTimeout(() => {
      if (this.notification && !this.showNotification) {
        this.showNotification = true;
      }
      this.notificationTimeout = window.setTimeout(() => {
        this.showNotification = false;
      }, 3000);
    }, 100);
  }

  removeNotificationElement(): void {
    if (!this.showNotification && this.notification) {
      this.notification = null;
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
      .searchStickersBySetIdAndTags(stickerSetId, tagsString, {
        page: this.currentPage,
        pageSize: this.pageSize,
      })
      .pipe(
        catchError((err) => {
          console.error('Search failed:', err);
          return of<PaginatedResponse<Sticker>>({
            data: [],
            total: 0,
            page: this.currentPage,
            pageSize: this.pageSize,
            totalPages: 0,
          });
        }),
      )
      .subscribe((response) => {
        if (!stickerSetId && !tagsString && this.currentPage === 1) {
          const recentIds = this.recentlyUsedStickersService.getRecentlyUsedStickerIds(32);
          const recentStickers: Sticker[] = [];
          const otherStickers: Sticker[] = [];
          for (const s of response.data) {
            const recentIndex = recentIds.indexOf(s.id);
            if (recentIndex !== -1) {
              recentStickers[recentIndex] = s;
            } else {
              otherStickers.push(s);
            }
          }
          this.visibleStickers = recentStickers.filter((s) => !!s).concat(otherStickers);
        } else {
          this.visibleStickers = response.data;
        }
        this.totalPages = response.totalPages;
      });
  }

  changePage(newPage: number): void {
    if (newPage >= 1 && newPage <= this.totalPages && newPage !== this.currentPage) {
      this.currentPage = newPage;
      this.searchStickers();
    }
  }
}
