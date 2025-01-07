import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import {createClient, Session, SupabaseClient, User} from '@supabase/supabase-js';
import {environment} from '@environments/environment';

import {SignInWithEmailPayload} from './auth.interface';

@Injectable({providedIn: null})
export class AuthService {
  private supabase!: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.SUPABASE_URL, environment.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  signInWithEmail(payload: SignInWithEmailPayload): Observable<void> {
    return new Observable((subscriber) => {
      this.supabase.auth
        .signInWithPassword(payload)
        .then(({data: _, error}) => {
          if (error) {
            subscriber.error(error);
          } else {
            subscriber.next();
            subscriber.complete();
          }
        })
        .catch((err) => {
          subscriber.error(err);
        });
    });
  }

  isAuthenticated(): Observable<boolean> {
    return new Observable((subscriber) => {
      this.supabase.auth
        .getSession()
        .then(({data, error}) => {
          if (error) {
            subscriber.error(error);
          } else {
            subscriber.next(!!data?.session?.user);
            subscriber.complete();
          }
        })
        .catch((err) => {
          subscriber.error(err);
        });
    });
  }

  getSession(): Observable<Session | null> {
    return new Observable((subscriber) => {
      this.supabase.auth
        .getSession()
        .then(({data, error}) => {
          if (error) {
            subscriber.error(error);
          } else {
            subscriber.next(data?.session ?? null);
            subscriber.complete();
          }
        })
        .catch((err) => {
          subscriber.error(err);
        });
    });
  }

  getUser(): Observable<User | null> {
    return this.getSession().pipe(map((session) => session?.user ?? null));
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }
}
