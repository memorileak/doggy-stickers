import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {AuthModule} from '@modules/auth';

import {StickerSetsService} from './sticker-sets.service';
import {StickersService} from './stickers.service';
import {RecentlyUsedStickersService} from './recently-used-stickers.service';

@NgModule({
  declarations: [],
  imports: [CommonModule, AuthModule],
  providers: [StickerSetsService, StickersService, RecentlyUsedStickersService],
})
export class StickersModule {}
