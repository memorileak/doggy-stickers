import {Observable, from, map} from 'rxjs';
import {Injectable} from '@angular/core';
import {AuthService} from '@modules/auth';

import {PaginatedResponse, PaginationParams, Sticker} from './stickers.interface';
import {RecentlyUsedStickersService} from './recently-used-stickers.service';

@Injectable({providedIn: null})
export class StickersService {
  constructor(
    private readonly authService: AuthService,
    private readonly recentlyUsedStickersService: RecentlyUsedStickersService,
  ) {}

  getAllStickers(pagination?: PaginationParams): Observable<PaginatedResponse<Sticker>> {
    const client = this.authService.getClient();
    const {page = 1, pageSize = 20} = pagination || {};
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    return from(
      client
        .from('stickers')
        .select('*, set_name:sticker_sets(name)', {count: 'exact'})
        .order('created_at', {ascending: false})
        .range(start, end),
    ).pipe(
      map(({data, error, count}) => {
        if (error) throw error;
        const stickers = (data || []).map((s) => ({...s, set_name: s.set_name?.name ?? ''}));
        return {
          data: stickers,
          total: count || 0,
          page,
          pageSize,
          totalPages: Math.ceil((count || 0) / pageSize),
        };
      }),
    );
  }

  getStickersBelongToSet(
    stickerSetId: number,
    pagination?: PaginationParams,
  ): Observable<PaginatedResponse<Sticker>> {
    const client = this.authService.getClient();
    const {page = 1, pageSize = 20} = pagination || {};
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    return stickerSetId === 0
      ? this.getAllStickers(pagination)
      : from(
          client
            .from('stickers')
            .select('*, set_name:sticker_sets(name)', {count: 'exact'})
            .eq('set_id', stickerSetId)
            .order('created_at', {ascending: false})
            .range(start, end),
        ).pipe(
          map(({data, error, count}) => {
            if (error) throw error;
            const stickers = (data || []).map((s) => ({...s, set_name: s.set_name?.name ?? ''}));
            return {
              data: stickers,
              total: count || 0,
              page,
              pageSize,
              totalPages: Math.ceil((count || 0) / pageSize),
            };
          }),
        );
  }

  createMultipleStickersInSet(
    stickerSetId: number,
    stickerFiles: FileList,
  ): Observable<{completed: number; total: number; stickers: Sticker[]}> {
    return new Observable((subscriber) => {
      const total = stickerFiles.length;
      let completed = 0;
      const createdStickers: Sticker[] = [];

      const processNextFile = async (index: number) => {
        if (index >= total) {
          subscriber.complete();
          return;
        }

        try {
          const file = stickerFiles[index];
          const fileName = this.generateStickerFileName(stickerSetId);
          const fileExt = file.name.split('.').pop();
          const fullPath = `${fileName}.${fileExt}`;

          const client = this.authService.getClient();

          // Upload file to storage
          const {data: uploadData, error: uploadError} = await client.storage
            .from('doggy-stickers-bucket')
            .upload(fullPath, file);

          if (uploadError) throw uploadError;

          // Create sticker record
          const {data: stickerData, error: insertError} = await client
            .from('stickers')
            .insert({
              set_id: stickerSetId,
              image_path: uploadData.path,
              tags: [],
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (insertError) throw insertError;

          createdStickers.push(stickerData);
          completed++;
          subscriber.next({completed, total, stickers: createdStickers});

          // Process next file
          await processNextFile(index + 1);
        } catch (error) {
          subscriber.error(error);
        }
      };

      // Start processing from first file
      processNextFile(0);
    });
  }

  getStickerPublicUrl(stickerImagePath: string): string {
    const client = this.authService.getClient();
    return client.storage.from('doggy-stickers-bucket').getPublicUrl(stickerImagePath)?.data
      ?.publicUrl;
  }

  updateStickerTags(stickerId: number, tags: string[]): Observable<Sticker> {
    const client = this.authService.getClient();
    return from(client.from('stickers').update({tags}).eq('id', stickerId).select().single()).pipe(
      map(({data, error}) => {
        if (error) throw error;
        return data;
      }),
    );
  }

  deleteSticker(stickerId: number): Observable<void> {
    const client = this.authService.getClient();
    return from(client.from('stickers').delete().eq('id', stickerId)).pipe(
      map(({error}) => {
        if (error) throw error;
      }),
    );
  }

  searchStickersBySetIdAndTags(
    stickerSetId: number,
    tagsString: string,
    pagination?: PaginationParams,
  ): Observable<PaginatedResponse<Sticker>> {
    const {page = 1, pageSize = 20} = pagination || {};
    if (stickerSetId === -1) {
      const recentlyUsedStickerIds =
        this.recentlyUsedStickersService.getRecentlyUsedStickerIds(pageSize);
      return this.getStickersByIds(recentlyUsedStickerIds, pagination);
    }

    const tags = tagsString
      .split(' ')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0 && tag !== '-');

    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    const client = this.authService.getClient();
    const query = client
      .from('stickers')
      .select('*, set_name:sticker_sets(name)', {count: 'exact'});

    const positiveTags: string[] = [];
    const negativeTags: string[] = [];
    let isNsfwAllowed = false;

    for (const t of tags) {
      if (t === 'nsfw') {
        isNsfwAllowed = true;
      }
      if (t.startsWith('-')) {
        negativeTags.push(t.slice(1));
      } else {
        positiveTags.push(t);
      }
    }

    if (!isNsfwAllowed) {
      negativeTags.push('nsfw');
    }

    if (positiveTags.length > 0) {
      query.contains('tags', positiveTags);
    }

    if (negativeTags.length > 0) {
      // Not overlaps (&&): Exclude if there's ANY overlap with negative tags
      query.not('tags', 'ov', `{${negativeTags.join(',')}}`);
    }

    if (stickerSetId > 0) {
      query.eq('set_id', stickerSetId);
    }

    query.order('created_at', {ascending: false}).range(start, end);

    return from(query).pipe(
      map(({data, error, count}) => {
        if (error) throw error;
        const stickers = (data || []).map((s) => ({...s, set_name: s.set_name?.name ?? ''}));
        return {
          data: stickers,
          total: count || 0,
          page,
          pageSize,
          totalPages: Math.ceil((count || 0) / pageSize),
        };
      }),
    );
  }

  private getStickersByIds(
    stickerIds: number[],
    pagination?: PaginationParams,
  ): Observable<PaginatedResponse<Sticker>> {
    const client = this.authService.getClient();
    const {page = 1, pageSize = 20} = pagination || {};

    if (stickerIds.length > 0) {
      const query = client
        .from('stickers')
        .select('*, set_name:sticker_sets(name)', {count: 'exact'})
        .in('id', stickerIds)
        .order('id', {ascending: true});
      return from(query).pipe(
        map(({data, error, count}) => {
          if (error) throw error;
          const stickers: Sticker[] = (data || []).map((s) => ({
            ...s,
            set_name: s.set_name?.name ?? '',
          }));
          const mapIdToSticker: Record<number, Sticker> = {};
          for (const s of stickers) {
            mapIdToSticker[s.id] = s;
          }
          const sortedStickers = stickerIds.map((id) => mapIdToSticker[id]);
          return {
            data: sortedStickers,
            total: count || 0,
            page,
            pageSize,
            totalPages: Math.ceil((count || 0) / pageSize),
          };
        }),
      );
    }

    return from([
      {
        data: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      },
    ]);
  }

  private generateStickerFileName(stickerSetId: number): string {
    return `${stickerSetId}_${Date.now()}_${this.randomBytes(4)}`;
  }

  private randomBytes(size: number): string {
    const array = new Uint8Array(size);
    crypto.getRandomValues(array);
    return Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
