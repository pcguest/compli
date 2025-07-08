import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  try {
    // Verify document ownership and get file name
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .select('file_name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (dbError || !document) {
      console.error('Supabase DB Fetch Error or Document Not Found:', dbError);
      return NextResponse.json({ error: 'Document not found or unauthorized' }, { status: 404 });
    }

    const fileExt = document.file_name.split('.').pop();
    const fileName = `${id}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    const { data: signedURL, error: storageError } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 60);

    if (storageError) {
      console.error('Supabase Storage Signed URL Error:', storageError);
      return NextResponse.json({ error: storageError.message }, { status: 500 });
    }

    return NextResponse.json({ signedURL: signedURL.signedUrl });
  } catch (error: any) {
    console.error('Unexpected error during document download:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}