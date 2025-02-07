import {Observable, from, map} from 'rxjs';
import {Injectable} from '@angular/core';
import {AuthService} from '@modules/auth';

import {PaginatedResponse, PaginationParams, Sticker} from './stickers.interface';

@Injectable({providedIn: null})
export class StickersService {
  constructor(private readonly authService: AuthService) {}

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
    const tags = tagsString
      .split(' ')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const client = this.authService.getClient();
    const {page = 1, pageSize = 20} = pagination || {};
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    const query = client
      .from('stickers')
      .select('*, set_name:sticker_sets(name)', {count: 'exact'});

    if (tags.length > 0) {
      query.contains('tags', tags);
    }

    if (stickerSetId > 0) {
      query.eq('set_id', stickerSetId);
    }

    return from(query.order('created_at', {ascending: false}).range(start, end)).pipe(
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
