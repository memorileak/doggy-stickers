import {catchError, Observable, Subject, of, debounceTime, distinctUntilChanged, map} from 'rxjs';
import {CommonModule} from '@angular/common';
import {Component, OnDestroy, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Params, Router, RouterLink} from '@angular/router';
import {
  StickerSet,
  Sticker,
  StickerSetsService,
  StickersService,
  RecentlyUsedStickersService,
  PaginatedResponse,
} from '@modules/stickers';

type UINotification = {isError: boolean; content: string};
type RouteQueryParams = {
  as: number; // Active Set
  q: string; // Query
  p: number; // Page
};

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
  doSearchingStickersSubject$: Subject<RouteQueryParams>;

  searchKeyword = '';
  pageSize = 20;
  totalPages = 1;
  visibleStickers: Sticker[] = [];

  notification: UINotification | null = null;
  showNotification = false;

  isSidebarOpen = window.innerWidth >= this.LEFT_SIDEBAR_BREAKPOINT;

  constructor(
    readonly router: Router,
    readonly activatedRoute: ActivatedRoute,
    readonly stickerSetsService: StickerSetsService,
    readonly stickersService: StickersService,
    readonly recentlyUsedStickersService: RecentlyUsedStickersService,
  ) {
    this.resizeHandler = this.resizeHandler.bind(this);
    this.searchStickers = this.searchStickers.bind(this);
    this.fromParamsToRouteQueryParams = this.fromParamsToRouteQueryParams.bind(this);

    this.stickerSets$ = this.stickerSetsService.getAllStickerSets(true);
    this.activeSetSubject$ = new Subject<StickerSet>();
    this.searchKeywordSubject$ = new Subject<string>();
    this.doSearchingStickersSubject$ = new Subject<RouteQueryParams>();
  }

  ngOnInit() {
    window.addEventListener('resize', this.resizeHandler);
    this.searchKeyword = this.currentQuery.q;

    this.doSearchingStickersSubject$.pipe(debounceTime(100)).subscribe(this.searchStickers);

    this.activatedRoute.queryParams
      .pipe(map(this.fromParamsToRouteQueryParams))
      .subscribe(this.doSearchingStickersSubject$);

    this.stickerSets$.subscribe((stickerSets) => {
      if (Array.isArray(stickerSets) && stickerSets?.length) {
        const {as: activeSetId} = this.currentQuery;
        const nextActiveSet = stickerSets.find((s) => s.id === activeSetId) ?? stickerSets[0];
        this.activeSetSubject$.next(nextActiveSet);
      }
    });

    this.activeSetSubject$.subscribe((activeSet) => {
      const {as, ...theRestParams} = this.currentQuery;
      if (as !== (activeSet?.id ?? 0)) {
        this.router.navigate([], {
          relativeTo: this.activatedRoute,
          queryParams: {...theRestParams, as: activeSet?.id ?? 0, p: 1},
        });
      }
    });

    this.searchKeywordSubject$
      .pipe(debounceTime(500), distinctUntilChanged())
      .subscribe((searchKeyword) => {
        const params = this.currentQuery;
        this.router.navigate([], {
          relativeTo: this.activatedRoute,
          queryParams: {...params, q: searchKeyword, p: 1},
        });
      });
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
    if (this.notificationTimeout) {
      window.clearTimeout(this.notificationTimeout);
    }
    this.activeSetSubject$.complete();
    this.searchKeywordSubject$.complete();
    this.doSearchingStickersSubject$.complete();
  }

  get currentQuery(): RouteQueryParams {
    return this.fromParamsToRouteQueryParams(this.activatedRoute.snapshot.queryParams);
  }

  private fromParamsToRouteQueryParams(params: Params): RouteQueryParams {
    const {as, q, p} = params;
    const legitP = Math.abs(parseInt(p ?? '1') || 1);
    return {
      as: parseInt(as ?? '0') || 0,
      q: q ?? '',
      p: legitP,
    };
  }

  private resizeHandler(): void {
    this.isSidebarOpen = window.innerWidth >= this.LEFT_SIDEBAR_BREAKPOINT;
  }

  selectSet(set: StickerSet) {
    this.activeSetSubject$.next(set);
  }

  async copyStickerToClipboard(sticker: Sticker): Promise<void> {
    try {
      this.recentlyUsedStickersService.pushStickerId(sticker.id);
      const stickerUrl = this.stickersService.getStickerPublicUrl(sticker.image_path);
      const response = await fetch(stickerUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
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

  searchStickers(queryParams: RouteQueryParams): void {
    const stickerSetId = queryParams.as;
    const tagsString = queryParams.q;
    this.stickersService
      .searchStickersBySetIdAndTags(stickerSetId, tagsString, {
        page: queryParams.p,
        pageSize: this.pageSize,
      })
      .pipe(
        catchError((err) => {
          console.error('Search failed:', err);
          return of<PaginatedResponse<Sticker>>({
            data: [],
            total: 0,
            page: queryParams.p,
            pageSize: this.pageSize,
            totalPages: 0,
          });
        }),
      )
      .subscribe((response) => {
        this.visibleStickers = response.data;
        this.totalPages = response.totalPages;
      });
  }

  changePage(newPage: number): void {
    const {p, ...theRestParams} = this.currentQuery;
    if (newPage >= 1 && newPage <= this.totalPages && newPage !== p) {
      this.router.navigate([], {
        relativeTo: this.activatedRoute,
        queryParams: {...theRestParams, p: newPage},
      });
    }
  }
}
