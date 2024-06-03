<script lang="ts">
	import { goto } from '$app/navigation';

	// only for development
	setTimeout( () => {
		goto( '/admin/dashboard' );
	}, 60 * 1000 );
</script>

<div>
	<h2>Welcome first_name last_name</h2>

	<p>
		Your account has been created and verified.  Our administrators have been
		notified and will enable your account shortly.  You will recieve an email 
		once your account has been activated.
	</p>

</div>