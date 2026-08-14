<?php

return [
    /*
    | The production seeder creates only the initial general-manager account.
    | A deployment must provide a strong, one-time password explicitly.
    */
    'initial_admin_username' => env('INITIAL_ADMIN_USERNAME', 'admin'),
    'initial_admin_password' => env('INITIAL_ADMIN_PASSWORD'),
];
