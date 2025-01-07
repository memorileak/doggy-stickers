import {Subject, catchError, Observable, of, switchMap, BehaviorSubject, share} from 'rxjs';
import {CommonModule} from '@angular/common';
import {Component, OnDestroy, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {StickerSet, Sticker, StickerSetsService, StickersService} from '@modules/stickers';

@Component({
  selector: 'app-manage-stickers',
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-stickers.component.html',
})
export class ManageStickersComponent implements OnInit, OnDestroy {
  private readonly LEFT_SIDEBAR_BREAKPOINT = 1024; // 1024px is lg breakpoint

  refreshStickerSets$: BehaviorSubject<Symbol>;
  stickerSets$: Observable<StickerSet[]>;

  activeStickerSetSubject$: Subject<StickerSet>;

  activeStickerSet: StickerSet | null = null;
  activeStickers: Sticker[] = [];
  stickerImportFiles: FileList | null = null;
  isImportingInProgress: boolean = false;
  importCompleted: number = 0;
  importTotal: number = 0;
  importingError: string | null = null;

  showNewSetModal = false;
  showImportModal = false;
  newSetName = '';

  isSidebarOpen = window.innerWidth >= this.LEFT_SIDEBAR_BREAKPOINT;

  constructor(
    readonly stickerSetsService: StickerSetsService,
    readonly stickersService: StickersService,
  ) {
    this.resizeHandler = this.resizeHandler.bind(this);
    this.refreshStickerSets$ = new BehaviorSubject<Symbol>(Symbol());
    this.activeStickerSetSubject$ = new Subject<StickerSet>();
    this.stickerSets$ = this.refreshStickerSets$.pipe(
      switchMap(() => this.stickerSetsService.getAllStickerSets()),
      catchError((err) => {
        console.error(err);
        return of([]);
      }),
      share(),
    );
  }

  ngOnInit() {
    window.addEventListener('resize', this.resizeHandler);

    this.stickerSets$.subscribe((stickerSets) => {
      if (Array.isArray(stickerSets) && stickerSets?.length) {
        const activeSetId = this.activeStickerSet?.id ?? -Infinity;
        const nextActiveSet = stickerSets.find((s) => s.id === activeSetId) ?? stickerSets[0];
        this.activeStickerSetSubject$.next(nextActiveSet);
      }
    });

    this.activeStickerSetSubject$.subscribe((stickerSet) => {
      this.activeStickerSet = stickerSet;
      this.reloadActiveStickers();
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.refreshStickerSets$.complete();
    this.activeStickerSetSubject$.complete();
  }

  private resizeHandler(): void {
    this.isSidebarOpen = window.innerWidth >= this.LEFT_SIDEBAR_BREAKPOINT;
  }

  reloadStickerSets(): void {
    this.refreshStickerSets$.next(Symbol());
  }

  reloadActiveStickers(): void {
    const activeStickerSetId = this.activeStickerSet?.id ?? 0;
    if (activeStickerSetId) {
      this.stickersService
        .getStickersBelongToSet(activeStickerSetId)
        .pipe(
          catchError((err) => {
            console.error('Error loading active stickers', err);
            return of([]);
          }),
        )
        .subscribe((stickers) => {
          this.activeStickers = stickers;
        });
    }
  }

  selectSet(set: StickerSet) {
    this.activeStickerSetSubject$.next(set);
  }

  openNewSetModal() {
    this.showNewSetModal = true;
  }

  closeNewSetModal() {
    this.showNewSetModal = false;
    this.newSetName = '';
  }

  openImportModal() {
    this.showImportModal = true;
  }

  closeImportModal() {
    this.showImportModal = false;
  }

  createNewSet() {
    const newSetName = this.newSetName.trim();
    if (newSetName) {
      this.stickerSetsService.createNewStickerSet(newSetName).subscribe({
        next: () => {
          this.reloadStickerSets();
          this.closeNewSetModal();
        },
        error: (error) => {
          console.error('Failed to create sticker set:', error);
        },
      });
    }
  }

  addTag(sticker: Sticker, input: HTMLInputElement) {
    const tagsString = input.value.trim();
    const tags = tagsString
      .split(' ')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    let shouldUpdate = false;
    let seen: Record<string, boolean> = {};
    const newTags = [...sticker.tags];
    for (const t of tags) {
      if (!sticker.tags.includes(t) && !seen[t]) {
        newTags.push(t);
        seen[t] = true;
        shouldUpdate = true;
      }
    }
    if (shouldUpdate) {
      this.stickersService.updateStickerTags(sticker.id, newTags).subscribe({
        next: (updatedSticker) => {
          sticker.tags = updatedSticker.tags;
          input.value = '';
        },
        error: (error) => {
          console.error('Failed to add tag:', error);
        },
      });
    } else {
      input.value = '';
    }
  }

  deleteSticker(sticker: Sticker) {
    if (confirm('Are you sure you want to delete this sticker?')) {
      this.stickersService.deleteSticker(sticker.id).subscribe({
        next: () => {
          this.reloadStickerSets();
        },
        error: (error) => {
          console.error('Failed to delete sticker:', error);
        },
      });
    }
  }

  removeTag(sticker: Sticker, tag: string) {
    const newTags = sticker.tags.filter((t) => t !== tag);
    this.stickersService.updateStickerTags(sticker.id, newTags).subscribe({
      next: (updatedSticker) => {
        sticker.tags = updatedSticker.tags;
      },
      error: (error) => {
        console.error('Failed to remove tag:', error);
      },
    });
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files) {
      this.handleFiles(files);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.handleFiles(input.files);
    }
  }

  handleFiles(files: FileList) {
    if (files?.length) {
      this.stickerImportFiles = files;
    }
  }

  importStickers() {
    const activeSet = this.activeStickerSet;
    const files = this.stickerImportFiles;

    if (files?.length && activeSet?.id) {
      this.stickerImportFiles = null;
      this.isImportingInProgress = true;
      this.importCompleted = 0;
      this.importTotal = files?.length ?? 0;
      this.importingError = null;

      this.stickersService.createMultipleStickersInSet(activeSet.id, files).subscribe({
        next: (data) => {
          this.importCompleted = data.completed;
        },
        error: (err) => {
          console.error(err);
          this.isImportingInProgress = false;
          this.importingError = `Error happened, could not import all selected files. Completed: ${this.importCompleted}/${this.importTotal}.`;
          this.reloadStickerSets();
        },
        complete: () => {
          this.closeImportModal();
          this.reloadStickerSets();
          setTimeout(() => {
            this.isImportingInProgress = false;
            this.importCompleted = 0;
            this.importTotal = 0;
            this.importingError = null;
          }, 250);
        },
      });
    }
  }
}
