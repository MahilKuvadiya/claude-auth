import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth';
import { Card } from '@/components/ui/card';
import { initGoogle, renderGoogleButton, whenGoogleReady, promptGoogle } from '@/lib/googleAuth';

export function SignIn() {
  const { error } = useAuth();
  const btnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    whenGoogleReady(() => {
      initGoogle();
      if (btnRef.current) renderGoogleButton(btnRef.current);
      promptGoogle(); // One Tap, if eligible
    });
  }, []);

  return (
    <div className="app-wash grid h-screen place-items-center p-6">
      <Card className="w-full max-w-[400px] p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-lg bg-primary font-display text-2xl font-semibold leading-none text-primary-foreground">c</div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">claudex console</h1>
          <p className="mb-6 mt-1 text-[.9rem] text-muted-foreground">Sign in with your devxlabs Google account.</p>
        </div>
        <div ref={btnRef} className="flex justify-center" />
        {error && <div className="mt-4 text-center text-[.84rem] text-destructive">{error}</div>}
      </Card>
    </div>
  );
}
