import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, file_name, file_size, uploaded_at, deleted')
      .eq('user_id', user.id)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Supabase DB Fetch Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(documents);
  } catch (error: any) {
    console.error('Unexpected error during document listing:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}