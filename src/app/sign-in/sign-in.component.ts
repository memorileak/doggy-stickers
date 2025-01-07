import {firstValueFrom} from 'rxjs';
import {CommonModule} from '@angular/common';
import {Component, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Router} from '@angular/router';

import {AuthService} from '@modules/auth';
import {UiModule} from '@modules/ui';

@Component({
  selector: 'app-sign-in',
  imports: [CommonModule, ReactiveFormsModule, UiModule],
  templateUrl: './sign-in.component.html',
})
export class SignInComponent implements OnInit {
  signInForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  formErrors = {
    email: '',
    password: '',
  };

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private readonly authService: AuthService,
  ) {
    this.signInForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rememberMe: [false],
    });
  }

  ngOnInit(): void {
    this.signInForm.valueChanges.subscribe(() => {
      this.updateFormErrors();
    });
  }

  updateFormErrors(): void {
    if (!this.signInForm) return;

    for (const field of Object.keys(this.formErrors)) {
      this.formErrors[field as keyof typeof this.formErrors] = '';
      const control = this.signInForm.get(field);

      if (control && control.dirty && !control.valid) {
        const messages = {
          required: `${field} is required`,
          email: 'Please enter a valid email address',
          minlength: `${field} must be at least 6 characters`,
        };

        for (const key of Object.keys(control.errors || {})) {
          this.formErrors[field as keyof typeof this.formErrors] =
            messages[key as keyof typeof messages];
        }
      }
    }
  }

  async onSubmit(): Promise<void> {
    if (this.signInForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const {email, password} = this.signInForm.value;
      await firstValueFrom(this.authService.signInWithEmail({email, password}));
      await this.router.navigate(['/manage-stickers']);
    } catch (error: any) {
      this.errorMessage = error?.message || 'Failed to sign in';
    } finally {
      this.isLoading = false;
    }
  }
}
