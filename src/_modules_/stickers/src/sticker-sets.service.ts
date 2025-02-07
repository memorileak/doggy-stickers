import {Observable, from, map} from 'rxjs';
import {Injectable} from '@angular/core';
import {AuthService} from '@modules/auth';

import {StickerSet} from './stickers.interface';
import {RecentlyUsedStickersService} from './recently-used-stickers.service';

@Injectable({providedIn: null})
export class StickerSetsService {
  constructor(
    private readonly authService: AuthService,
    private readonly recentlyUsedStickersService: RecentlyUsedStickersService,
  ) {}

  getAllStickerSets(includeSpecialSets = false): Observable<StickerSet[]> {
    const client = this.authService.getClient();
    return from(
      (async () => {
        const {data, error} = await client
          .from('sticker_sets')
          .select(`*, sticker_count:stickers(count)`)
          .order('created_at', {ascending: false});

        if (error) {
          return {data, error};
        }

        const stickerSets = (data || []).map((d) => ({
          ...d,
          sticker_count: d?.sticker_count?.[0]?.count ?? 0,
        }));

        if (includeSpecialSets) {
          // Special set: All Stickers
          const {count, error: countAllError} = await client
            .from('stickers')
            .select('*', {count: 'exact', head: true});

          if (countAllError) {
            return {data: stickerSets, error: countAllError};
          }

          stickerSets.unshift({
            id: 0,
            name: 'All Stickers',
            sticker_count: count,
            created_at: new Date().toISOString(),
          });

          // Special set: Recently Used
          if (this.recentlyUsedStickersService.getRecentlyUsedStickerIds(100)?.length > 0) {
            stickerSets.unshift({
              id: -1,
              name: 'Recently Used',
              sticker_count: 0,
              created_at: new Date().toISOString(),
            });
          }
        }

        return {data: stickerSets, error: null};
      })(),
    ).pipe(
      map(({data, error}) => {
        if (error) throw error;
        return data;
      }),
    );
  }

  createNewStickerSet(name: string): Observable<StickerSet> {
    const client = this.authService.getClient();
    return from(
      client
        .from('sticker_sets')
        .insert({name})
        .select(`*, sticker_count:stickers(count)`)
        .single(),
    ).pipe(
      map(({data, error}) => {
        if (error) throw error;
        return {
          ...data,
          sticker_count: data?.sticker_count?.[0]?.count ?? 0,
        };
      }),
    );
  }
}
